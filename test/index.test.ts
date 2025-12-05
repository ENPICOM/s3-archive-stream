import { S3Client } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import { mockClient } from 'aws-sdk-client-mock';
import fs from 'fs';
import { text } from 'stream/consumers';
import tar from 'tar-stream';
import { describe, expect, it } from 'vitest';
import { s3ArchiveStream } from '../src';
import { addS3MockCommands } from './mockClient';

const mockS3Bucket = {
    mockedBucket1: [
        'folder1/folder2/folder3/file1.txt',
        'folder1/folder2/folder3/file2.txt',
        'folder1/folder2/folder3/file3.txt',
        'test_file1.txt',
        'test_file2.txt',
        'test_file3.txt',
        'test_file4.txt',
    ],
    mockedBucket2: ['test_file1.txt', 'test_file2.txt', 'test_file3.txt', 'test_file4.txt'],
};

const s3Mock = mockClient(S3Client);
addS3MockCommands(s3Mock, mockS3Bucket);

describe('s3-archive-stream tests', async () => {
    it('should zip files from a bucket', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test1.zip';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
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

        // Create the stream archive
        const archive = s3ArchiveStream(new S3Client({}), filesToZip);
        archive.pipe(file).addListener('finished', () => {
            const zip = new AdmZip(outputArchiveName);

            // Check the entries
            expect(zip.getEntries().length).toBe(2);

            // Check the file contents
            const file1Contents = zip.readAsText(filesToZip[0].name);
            expect(file1Contents).toBe(`${filesToZip[0].s3BucketName}/${filesToZip[0].s3Key}`);
            const file2Contents = zip.readAsText(filesToZip[1].name);
            expect(file2Contents).toBe(`${filesToZip[1].s3BucketName}/${filesToZip[1].s3Key}`);
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it('should zip files from multiple buckets', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test2.zip';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
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
            {
                name: 'my_archive_filename3.txt',
                s3Key: 'test_file3.txt',
                s3BucketName: 'mockedBucket2',
            },
            {
                name: 'my_archive_filename4.txt',
                s3Key: 'test_file4.txt',
                s3BucketName: 'mockedBucket2',
            },
        ];

        // Create the stream archive
        const archive = s3ArchiveStream(
            { mockedBucket1: new S3Client({}), mockedBucket2: new S3Client({}) },
            filesToZip,
        );
        archive.pipe(file).addListener('finished', () => {
            const zip = new AdmZip(outputArchiveName);

            // Check the entries
            expect(zip.getEntries().length).toBe(4);

            // Check the file contents
            const file1Contents = zip.readAsText(filesToZip[0].name);
            expect(file1Contents).toBe(`${filesToZip[0].s3BucketName}/${filesToZip[0].s3Key}`);
            const file2Contents = zip.readAsText(filesToZip[1].name);
            expect(file2Contents).toBe(`${filesToZip[1].s3BucketName}/${filesToZip[1].s3Key}`);
            const file3Contents = zip.readAsText(filesToZip[2].name);
            expect(file3Contents).toBe(`${filesToZip[2].s3BucketName}/${filesToZip[2].s3Key}`);
            const file4Contents = zip.readAsText(filesToZip[3].name);
            expect(file4Contents).toBe(`${filesToZip[3].s3BucketName}/${filesToZip[3].s3Key}`);
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it('should zip folders and files', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test3.zip';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
        const filesToZip = [
            {
                name: 'my_archive_filename1.txt',
                s3Key: 'test_file1.txt',
                s3BucketName: 'mockedBucket1',
            },
            {
                s3Dir: 'folder1/',
                s3BucketName: 'mockedBucket1',
            },
        ];

        // Create the stream archive
        const archive = s3ArchiveStream(new S3Client({}), filesToZip);
        archive.pipe(file).addListener('finished', () => {
            const zip = new AdmZip(outputArchiveName);

            // Check the entries
            expect(zip.getEntries().length).toBe(4);

            // Check the file contents
            // @ts-expect-error
            const file1Contents = zip.readAsText(filesToZip[0].name);
            expect(file1Contents).toBe(`${filesToZip[0].s3BucketName}/${filesToZip[0].s3Key}`);
            const file2Contents = zip.readAsText('folder2/folder3/file1.txt');
            expect(file2Contents).toBe('mockedBucket1/folder1/folder2/folder3/file1.txt');
            const file3Contents = zip.readAsText('folder2/folder3/file2.txt');
            expect(file3Contents).toBe('mockedBucket1/folder1/folder2/folder3/file2.txt');
            const file4Contents = zip.readAsText('folder2/folder3/file3.txt');
            expect(file4Contents).toBe('mockedBucket1/folder1/folder2/folder3/file3.txt');
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it('should zip folders when preserveFolderStructure=true', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test4.zip';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
        const filesToZip = [
            {
                s3Dir: 'folder1/',
                preserveFolderStructure: true,
                s3BucketName: 'mockedBucket1',
            },
        ];

        // Create the stream archive
        const archive = s3ArchiveStream(new S3Client({}), filesToZip);
        archive.pipe(file).addListener('finished', () => {
            const zip = new AdmZip(outputArchiveName);

            // Check the entries
            expect(zip.getEntries().length).toBe(3);

            // Check the file contents
            const file2Contents = zip.readAsText('folder1/folder2/folder3/file1.txt');
            expect(file2Contents).toBe('mockedBucket1/folder1/folder2/folder3/file1.txt');
            const file3Contents = zip.readAsText('folder1/folder2/folder3/file2.txt');
            expect(file3Contents).toBe('mockedBucket1/folder1/folder2/folder3/file2.txt');
            const file4Contents = zip.readAsText('folder1/folder2/folder3/file3.txt');
            expect(file4Contents).toBe('mockedBucket1/folder1/folder2/folder3/file3.txt');
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it('should strip folder structures by default', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test5.zip';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
        const filesToZip = [
            {
                s3Key: 'folder1/folder2/folder3/file1.txt',
                s3BucketName: 'mockedBucket1',
            },
            {
                s3Key: 'folder1/folder2/folder3/file2.txt',
                s3BucketName: 'mockedBucket1',
            },
        ];

        // Create the stream archive
        const archive = s3ArchiveStream(new S3Client({}), filesToZip);
        archive.pipe(file).addListener('finished', () => {
            const zip = new AdmZip(outputArchiveName);

            // Check the entries
            expect(zip.getEntries().length).toBe(2);

            // Check the file contents
            const file1Contents = zip.readAsText('file1.txt');
            expect(file1Contents).toBe(`${filesToZip[0].s3BucketName}/${filesToZip[0].s3Key}`);
            const file2Contents = zip.readAsText('file2.txt');
            expect(file2Contents).toBe(`${filesToZip[1].s3BucketName}/${filesToZip[1].s3Key}`);
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it('should preserve folder structure of files when preserveFolderStrucure:true', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test6.zip';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
        const filesToZip = [
            {
                s3Key: 'folder1/folder2/folder3/file1.txt',
                s3BucketName: 'mockedBucket1',
                preserveFolderStructure: true,
            },
            {
                s3Key: 'folder1/folder2/folder3/file2.txt',
                s3BucketName: 'mockedBucket1',
                preserveFolderStructure: true,
            },
        ];

        // Create the stream archive
        const archive = s3ArchiveStream(new S3Client({}), filesToZip);
        archive.pipe(file).addListener('finish', () => {
            const zip = new AdmZip(outputArchiveName);

            // Check the entries
            expect(zip.getEntries().length).toBe(2);

            // Check the file contents
            const file1Contents = zip.readAsText('folder1/folder2/folder3/file1.txt');
            expect(file1Contents).toBe(`${filesToZip[0].s3BucketName}/${filesToZip[0].s3Key}`);
            const file2Contents = zip.readAsText('folder1/folder2/folder3/file2.txt');
            expect(file2Contents).toBe(`${filesToZip[1].s3BucketName}/${filesToZip[1].s3Key}`);
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    it('should output a tar if format:tar', async () => {
        // Configure the output zip
        const outputArchiveName = './output_test7.tar';
        const file = fs.createWriteStream(outputArchiveName, 'utf-8');

        // Our selection of files we want in the archive
        const filesToTar = [
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
            {
                name: 'my_archive_filename3.txt',
                s3Key: 'test_file3.txt',
                s3BucketName: 'mockedBucket2',
            },
            {
                name: 'my_archive_filename4.txt',
                s3Key: 'test_file4.txt',
                s3BucketName: 'mockedBucket2',
            },
        ];

        // Create the stream archive
        const archive = s3ArchiveStream(new S3Client({}), filesToTar, { format: 'tar' });
        archive.pipe(file).addListener('finish', async () => {
            const tarFiles: Record<string, string> = {};

            // Setup tar extraction
            const extract = tar.extract();
            // Pipe the .tar to the extractor
            fs.createReadStream(outputArchiveName).pipe(extract);

            // Read the tar entries
            for await (const entry of extract) {
                tarFiles[entry.header.name] = await text(entry);
                entry.resume();
            }

            // Check the entries
            expect(Object.entries(tarFiles).length).toBe(4);

            // Check the file contents
            expect(tarFiles[filesToTar[0].name]).toBe(`${filesToTar[0].s3BucketName}/${filesToTar[0].s3Key}`);
            expect(tarFiles[filesToTar[1].name]).toBe(`${filesToTar[1].s3BucketName}/${filesToTar[1].s3Key}`);
            expect(tarFiles[filesToTar[2].name]).toBe(`${filesToTar[2].s3BucketName}/${filesToTar[2].s3Key}`);
            expect(tarFiles[filesToTar[3].name]).toBe(`${filesToTar[3].s3BucketName}/${filesToTar[3].s3Key}`);
        });

        // Wait a bit for the zip to have been written and the on('finish') to have been resolved
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });
});
