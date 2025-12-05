import { GetObjectCommand, ListObjectsV2Command, type ListObjectsV2CommandOutput, S3Client } from '@aws-sdk/client-s3';
import archiver, { type Archiver, type ArchiverOptions, type EntryData, type Format } from 'archiver';
import { Readable } from 'stream';

class S3StreamArchiveError extends Error {}

class NoS3ClientProvidedForBucketError extends S3StreamArchiveError {
    constructor(s3BucketName: string) {
        super(`A S3Client instance was not provided for s3 bucket: ${s3BucketName}`);
    }
}

class FailedToGetArchiveEntryStreamError extends S3StreamArchiveError {
    constructor(s3Key: string, e: unknown) {
        super(
            `Failed to get object stream for s3 object: ${s3Key}. Check if your IAM credentials allow you access. Original Error: ${e}`,
        );
    }
}

class FailedToListObjectsError extends S3StreamArchiveError {
    constructor(s3Key: string, e: unknown) {
        super(
            `Failed to list s3 objects for directory path: ${s3Key}. Check if your IAM credentials allow you access. Original Error: ${e}`,
        );
    }
}

type S3BucketName = string;
type S3Key = string;

interface ArchiveEntry extends Omit<EntryData, 'name'> {
    s3Key: S3Key;
    s3BucketName: S3BucketName;
    name?: string;
    preserveFolderStructure?: boolean;
}

interface S3StreamArchiveOptions {
    format?: Format;
    archiverOptions?: ArchiverOptions;
}

function s3StreamArchive<C extends S3Client, Q extends Record<S3BucketName, C>>(
    clientOrClients: Q | C,
    entries: ArchiveEntry[],
    options?: S3StreamArchiveOptions,
): Archiver {
    const archive = archiver(options?.format ?? 'zip', options?.archiverOptions ?? {});

    async function appendArchiveEntries(s3Client: S3Client, archiveEntries: typeof entries) {
        for (const archiveEntry of archiveEntries) {
            // Check if the given s3Key is a directory
            // In that case, we will get all objects in it.
            if (archiveEntry.s3Key.endsWith('/')) {
                const directoryEntries: typeof entries = [];
                let continuationToken: string | undefined;

                while (true) {
                    // Include all files in the S3 sourcePath in the archive if sourceFiles is empty
                    try {
                        const listObjectsResponse: ListObjectsV2CommandOutput = await s3Client.send(
                            new ListObjectsV2Command({
                                Bucket: archiveEntry.s3BucketName,
                                Prefix: archiveEntry.s3Key,
                                ContinuationToken: continuationToken,
                            }),
                        );
                        continuationToken = listObjectsResponse.NextContinuationToken;

                        for (const { Key } of listObjectsResponse.Contents ?? []) {
                            if (Key != null && !Key.endsWith('/')) {
                                const archiveEntryName = archiveEntry.preserveFolderStructure
                                    ? Key
                                    : Key.slice(archiveEntry.s3Key.length);
                                directoryEntries.push({
                                    ...archiveEntry,
                                    name: archiveEntryName,
                                    s3Key: Key,
                                    s3BucketName: archiveEntry.s3BucketName,
                                });
                            }
                        }

                        if (!listObjectsResponse.IsTruncated) {
                            break;
                        }
                    } catch (e) {
                        throw new FailedToListObjectsError(archiveEntry.s3Key, e);
                    }
                }

                await appendArchiveEntries(s3Client, directoryEntries);
            } else {
                // Get the S3 Object stream
                try {
                    const { Body: s3ObjectStream } = await s3Client.send(
                        new GetObjectCommand({ Bucket: archiveEntry.s3BucketName, Key: archiveEntry.s3Key }),
                    );

                    if (s3ObjectStream == null || !(s3ObjectStream instanceof Readable)) {
                        throw new Error();
                    }
                    const archiveEntryName =
                        archiveEntry.name ??
                        (archiveEntry.preserveFolderStructure
                            ? archiveEntry.s3Key
                            : archiveEntry.s3Key.substring(archiveEntry.s3Key.lastIndexOf('/') + 1));
                    archive.append(s3ObjectStream, { ...archiveEntry, name: archiveEntryName });
                } catch (e) {
                    throw new FailedToGetArchiveEntryStreamError(archiveEntry.s3Key, e);
                }
            }
        }
    }

    const groups = entries.reduce<Record<S3BucketName, typeof entries>>((acc, val) => {
        if (acc[val.s3BucketName] == null) {
            acc[val.s3BucketName] = [];
        }
        acc[val.s3BucketName].push(val);
        return acc;
    }, {});

    Promise.all(
        Object.entries(groups).map(([s3BucketName, archiveEntries]) => {
            const client = clientOrClients instanceof S3Client ? clientOrClients : clientOrClients[s3BucketName];

            if (!(client instanceof S3Client)) {
                throw new NoS3ClientProvidedForBucketError(s3BucketName);
            }

            return appendArchiveEntries(client, archiveEntries);
        }),
    )
        .then(() => archive.finalize())
        .catch((e) => {
            throw e;
        });

    return archive;
}

export { s3StreamArchive, type ArchiveEntry, type S3StreamArchiveError, type S3StreamArchiveOptions };
