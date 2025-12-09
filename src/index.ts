import { GetObjectCommand, ListObjectsV2Command, type ListObjectsV2CommandOutput, S3Client } from '@aws-sdk/client-s3';
import archiver, {
    type Archiver,
    type ArchiverError,
    type ArchiverOptions,
    type EntryData,
    type Format,
    type ProgressData,
} from 'archiver';
import { Readable } from 'stream';

class S3ArchiveStreamError extends Error {
    originalError?: unknown;

    constructor(message: string, originalError?: unknown) {
        super(message);
        this.originalError = originalError;
    }

    get name() {
        return this.constructor.name;
    }
}

class NoS3ClientProvidedForBucketError extends S3ArchiveStreamError {
    constructor(s3BucketName: string) {
        super(`A S3Client instance was not provided for s3 bucket: ${s3BucketName}`);
    }
}

class FailedToGetS3ObjectStreamError extends S3ArchiveStreamError {
    constructor(s3Key: string, e: unknown) {
        super(`Failed to get object stream for s3 object: ${s3Key}. Original Error: ${e}`, e);
    }
}

class InvalidS3KeyError extends S3ArchiveStreamError {
    constructor(s3Key: string) {
        super(`The provided s3 key is invalid (empty or a folder): ${s3Key}`);
    }
}

class FailedToListObjectsError extends S3ArchiveStreamError {
    constructor(s3Key: string, e: unknown) {
        super(`Failed to list s3 objects for directory path: ${s3Key}. Original Error: ${e}`, e);
    }
}

type S3BucketName = string;
type S3Key = string;

type S3ArchiveStreamFileEntry = Omit<EntryData, 'name'> & {
    name?: string;
    s3BucketName: S3BucketName;
    s3Key: S3Key;
    preserveFolderStructure?: boolean;
};

type S3ArchiveStreamDirEntry = Omit<EntryData, 'name'> & {
    s3BucketName: S3BucketName;
    s3Dir: S3Key;
    preserveFolderStructure?: boolean;
};

type S3ArchiveStreamEntry = S3ArchiveStreamFileEntry | S3ArchiveStreamDirEntry;

interface S3ArchiveStreamOptions {
    format?: Format;
    archiverOptions?: ArchiverOptions;
}

/**
 * Create an Archiver instance that streams S3 objects (and S3 "directories") into a single archive.
 *
 * Returns an Archiver (readable) stream you can pipe to a destination (for example an HTTP response
 * or a file write stream). Each entry in `entries` must include `s3BucketName` and either:
 * - `s3Key`: a single object key to include, or
 * - `s3Dir`: a prefix (directory) — all non-folder objects under that prefix will be included.
 * When `s3Dir` is used the function will list objects for that prefix and append each object stream to
 * the archive. The optional `name` overrides the stored filename inside the archive.
 *
 * @param {Record<S3BucketName, S3Client> | S3Client} clientOrClients Either a single {@link S3Client}
 *     instance used for all buckets, or a mapping of bucket name -> {@link S3Client} to support multiple
 *     clients. When a map is provided each entry's `s3BucketName` will be used to pick the client.
 * @param {S3ArchiveStreamEntry[]} entries List of archive entries. Each entry must contain `s3BucketName`
 *     and either `s3Key` or `s3Dir`. See type `S3ArchiveStreamEntry` for allowed shapes.
 * @param {S3ArchiveStreamOptions} [options] Optional archiver options (format and archiver options).
 * @returns {Archiver} An Archiver instance. The archive is finalized automatically once all S3 objects
 *     have been queued. You should pipe this stream to your desired destination.
 *
 * @throws {S3ArchiveStreamError} Base error type for this module.
 * @throws {NoS3ClientProvidedForBucketError} When no S3 client is available for a referenced bucket.
 * @throws {FailedToListObjectsError} When listing objects for a directory prefix fails.
 * @throws {FailedToGetS3ObjectStreamError} When retrieving an object's stream from S3 fails.
 * @throws {ArchiverError} When an archiver-specific error occurs.
 */
function s3ArchiveStream(
    clientOrClients: Record<S3BucketName, S3Client> | S3Client,
    entries: S3ArchiveStreamEntry[],
    options?: S3ArchiveStreamOptions,
): Omit<Archiver, 'on'> & {
    on(event: 'error' | 'warning', listener: (error: ArchiverError | S3ArchiveStreamError) => void): Archiver;
    on(event: 'data', listener: (data: Buffer) => void): Archiver;
    on(event: 'progress', listener: (progress: ProgressData) => void): Archiver;
    on(event: 'close' | 'drain' | 'finish', listener: () => void): Archiver;
    on(event: 'pipe' | 'unpipe', listener: (src: Readable) => void): Archiver;
    on(event: 'entry', listener: (entry: EntryData) => void): Archiver;
} {
    const archive = archiver(options?.format ?? 'zip', options?.archiverOptions ?? {});

    async function appendArchiveEntries(s3Client: S3Client, archiveEntries: typeof entries) {
        // Loop through the entries
        for (const archiveEntry of archiveEntries) {
            // Check if the entry points to a directory
            // In that case, we will get all objects in it.
            if ('s3Dir' in archiveEntry) {
                const { s3BucketName, s3Dir, preserveFolderStructure, ...rest } = archiveEntry;
                const prefix = archiveEntry.s3Dir.endsWith('/') ? s3Dir : `${s3Dir}/`;

                const directoryEntries: typeof entries = [];
                let continuationToken: string | undefined;

                // Use ListObjectV2 to fetch all objects under the given prefix.
                while (true) {
                    try {
                        const listObjectsResponse: ListObjectsV2CommandOutput = await s3Client.send(
                            new ListObjectsV2Command({
                                Bucket: s3BucketName,
                                Prefix: prefix,
                                ContinuationToken: continuationToken,
                            }),
                        );

                        if (listObjectsResponse.ContinuationToken == null && listObjectsResponse.KeyCount === 0) {
                            throw new Error('The provided directory is empty.');
                        }

                        continuationToken = listObjectsResponse.NextContinuationToken;

                        for (const { Key } of listObjectsResponse.Contents ?? []) {
                            if (Key != null && !Key.endsWith('/') && Key !== '') {
                                const archiveEntryName = preserveFolderStructure ? Key : Key.slice(prefix.length);

                                // Append the s3 object to the list of objects to add for this dir.
                                directoryEntries.push({
                                    ...rest,
                                    name: archiveEntryName,
                                    s3Key: Key,
                                    s3BucketName: s3BucketName,
                                });
                            }
                        }

                        // End of the list.
                        if (!listObjectsResponse.IsTruncated) {
                            break;
                        }
                    } catch (e) {
                        throw new FailedToListObjectsError(prefix, e);
                    }
                }

                // Now that we have all s3 object keys for this dir,
                // We simply call appendArchiveEntries again with our directoryEntries.
                await appendArchiveEntries(s3Client, directoryEntries);
            } else {
                const { s3BucketName, s3Key, preserveFolderStructure, name, ...rest } = archiveEntry;

                if (s3Key === '' || s3Key.endsWith('/')) {
                    throw new InvalidS3KeyError(s3Key);
                }

                try {
                    // Get the s3 Object stream
                    const { Body: s3ObjectStream } = await s3Client.send(
                        new GetObjectCommand({
                            Bucket: s3BucketName,
                            Key: s3Key,
                        }),
                    );

                    // Validate the stream
                    if (s3ObjectStream == null || !(s3ObjectStream instanceof Readable)) {
                        throw new Error('S3 Object stream is null or not a Readable stream.');
                    }
                    // Determine which name to use in the archive,
                    // based on whether `name` is provided and if
                    // `preserveFolderStructure` is true or not.
                    const archiveEntryName =
                        name ?? (preserveFolderStructure ? s3Key : s3Key.substring(s3Key.lastIndexOf('/') + 1));

                    // Append the object stream to the archiver queue
                    archive.append(s3ObjectStream, { ...rest, name: archiveEntryName });
                } catch (e) {
                    throw new FailedToGetS3ObjectStreamError(s3Key, e);
                }
            }
        }
    }

    // Group all entries by s3 bucket name
    const groupedS3Buckets = entries.reduce<Record<S3BucketName, typeof entries>>((acc, val) => {
        if (acc[val.s3BucketName] == null) {
            acc[val.s3BucketName] = [];
        }
        acc[val.s3BucketName].push(val);
        return acc;
    }, {});

    // We use then/catch so the caller of `s3ArchiveStream` does not have to await
    // this function but can directly .pipe the archiver.Archiver stream
    Promise.all(
        Object.entries(groupedS3Buckets).map(async ([s3BucketName, archiveEntries]) => {
            // determine the S3 client for the current bucket
            const client = clientOrClients instanceof S3Client ? clientOrClients : clientOrClients[s3BucketName];

            if (!(client instanceof S3Client)) {
                throw new NoS3ClientProvidedForBucketError(s3BucketName);
            }

            return appendArchiveEntries(client, archiveEntries);
        }),
    )
        // When the Promise.all resolves, we finalize the archive, blocking further appends
        .then(() => archive.finalize())
        .catch((e) => {
            archive.destroy(e);
            archive.abort();
        });

    // Return the archiver.Archiver stream
    return archive;
}

export {
    s3ArchiveStream,
    S3ArchiveStreamError,
    type S3ArchiveStreamEntry,
    type S3ArchiveStreamFileEntry,
    type S3ArchiveStreamDirEntry,
    type S3ArchiveStreamOptions,
};
