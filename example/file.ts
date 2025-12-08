import { S3Client } from '@aws-sdk/client-s3';
import fs from 'fs';
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

// Create writeStream for the target output zip.
const outputFile = fs.createWriteStream('./output.zip', 'utf-8');
// Create the archive stream and pipe it to the output zip.
s3ArchiveStream(s3MockClient, filesToZip).pipe(outputFile);
