import { S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import { s3ArchiveStream } from '../src';
import { createMockedFiles } from '../test/mocks3Objects';

// Mock the bucket contents.
const mockS3Buckets = {
    ['mocked-bucket-1']: ['test_file1.txt', 'test_file2.txt'],
};

// Local S3 Mock server provided by adobe/s3mock container
const s3MockClient = new S3Client({ forcePathStyle: true, endpoint: 'http://localhost:9090' });
await createMockedFiles(s3MockClient, mockS3Buckets);

// Create express app
const app = express();
const port = 3000;

// Add GET /download-me endpoint
app.get('/download-me', (_req, res) => {
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

    // Create the archive stream and directly pipe it to the response
    s3ArchiveStream(s3MockClient, filesToZip).pipe(res);
});

app.listen(port, () => {
    console.log(`Server running, go to http://localhost:${port}/download-me`);
});
