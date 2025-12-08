import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import { PassThrough, Readable } from 'stream';
import { s3ArchiveStream } from '../src';
import { createMockedFiles } from '../test/mocks3Objects';

// Mock the bucket contents.
const mockS3Buckets = {
    ['mocked-bucket-1']: ['test_file1.txt', 'test_file2.txt'],
};

// Local S3 Mock server provided by adobe/s3mock container.
const s3MockClient = new S3Client({
    forcePathStyle: true,
    region: 'us-east-1',
    credentials: { accessKeyId: '', secretAccessKey: '' },
    endpoint: 'http://localhost:9090',
});
await createMockedFiles(s3MockClient, mockS3Buckets);

const filesToZip = [
    {
        name: 'my_archive_filename1.txt',
        s3Key: 'test_file1.txt',
        s3BucketName: 'mocked-bucket-1',
    },
    {
        name: 'my_archive_filename2.txt',
        s3Key: 'test_file2.txt',
        s3BucketName: 'mocked-bucket-1',
    },
];

// We can't directly provide the archiver.Archiver object to `Body`,
// so we use a Passthrough stream as intermediate.
const outputZipFilename = 'example.zip';
const stream = new PassThrough();
s3ArchiveStream(s3MockClient, filesToZip).pipe(stream);

const upload = new Upload({
    client: s3MockClient,
    params: { Bucket: 'mocked-bucket-1', Key: outputZipFilename, Body: stream },
});

// Wait for the upload to be done.
await upload.done();

// Download the zip from S3 again.
const zip = await s3MockClient.send(new GetObjectCommand({ Bucket: 'mocked-bucket-1', Key: outputZipFilename }));

if (zip.Body instanceof Readable) {
    // Write it to ./example.zip.
    zip.Body.pipe(fs.createWriteStream(outputZipFilename));
}
