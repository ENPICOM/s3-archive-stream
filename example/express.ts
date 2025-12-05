import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import { s3ArchiveStream } from '../src';
import { addS3MockCommands } from '../test/mockClient';

// Mock the bucket contents. These can be found in the ./test/ folder
const mockS3Bucket = {
    mockedBucket1: ['test_file1.txt', 'test_file2.txt'],
};

// Mock AWS S3 SDK so we don't have to actually call an S3 bucket
const s3Mock = mockClient(S3Client);
addS3MockCommands(s3Mock, mockS3Bucket);

// Create express app
const app = express();
const port = 3000;

// Add GET /download-me endpoint
app.get('/download-me', (_req, res) => {
    const filesToZip = [
        {
            name: 'my_archive_filename1.txt',
            s3Key: 'test_file1.txt',
            s3BucketName: 'mockedBucket1',
        },
        {
            name: 'my_archive_filename2.txt',
            s3Key: 'test_file2.txt',
            s3BucketName: 'mockedBucket1',
        },
    ];

    // Create the archive stream and directly pipe it to the response
    s3ArchiveStream(new S3Client({}), filesToZip).pipe(res);
});

app.listen(port, () => {
    console.log(`Server running, go to http://localhost:${port}/download-me`);
});
