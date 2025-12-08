import { CreateBucketCommand, ListBucketsCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

export async function createMockedFiles(s3Client: S3Client, s3Objects: Record<string, string[]>) {
    for (const [bucket, entries] of Object.entries(s3Objects)) {
        const buckets = await s3Client.send(new ListBucketsCommand());
        if (!buckets.Buckets?.find((b) => b.Name === bucket)) {
            await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
        }
        await Promise.all(
            entries.map((entry) =>
                s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: entry, Body: `${bucket}/${entry}` })),
            ),
        );
    }
}
