import { S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import fs from 'fs';
import { s3StreamArchive } from '../src';
import { addS3MockCommands } from '../test/mockClient';

// Mock the bucket contents. These can be found in the ./test/ folder
const mockS3Bucket = {
    mockedBucket1: ['test_file1.txt', 'test_file2.txt'],
};

// Mock AWS S3 SDK so we don't have to actually call an S3 bucket
const s3Mock = mockClient(S3Client);
addS3MockCommands(s3Mock, mockS3Bucket);

function writeS3ObjectsToZip() {
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

    // Create writeStream for the target output zip
    const outputFile = fs.createWriteStream('./output.zip', 'utf-8');
    // Create the archive stream and pipe it to the output zip
    s3StreamArchive(new S3Client({}), filesToZip).pipe(outputFile);
}

writeS3ObjectsToZip();
