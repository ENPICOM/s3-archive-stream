# s3-archive-stream

A NodeJS utility to stream-zip S3 objects into a single archive using [Archiver](https://www.archiverjs.com/) and the [AWS SDK](https://github.com/aws/aws-sdk-js-v3).

## Motivation

Since there is no native method of AWS to ZIP & download multiple s3 objects from a s3 bucket, a client side solution is required. Although there are some examples out there, many utilities have not been maintained for a long time, or lack support of advanced features. `s3-archive-stream`, built with Archiver, tries to fill that gap by providing a very simple function that returns an `archiver.Archiver` stream which can be used to pipe to a target, such as a http response or a file on disk.

One of the key features of this utility is the support of stream-zipping s3 objects from _multiple s3 buckets_ using multiple `S3Client` instances. This is useful when you for example have a set of credentials per bucket, instead of a single client that has broad permissions on multiple buckets.


## Installation

```bash
npm install s3-archive-stream
```

## Basic Usage

### Stream to file

`s3-archive-stream` exports a single function `s3ArchiveStream()`, which return an `archiver.Archiver` stream which can be used to pipe to a target, such as a http response or a file on disk.

```ts
import fs from 'fs'
import { s3ArchiveStream } from 's3-archive-stream';

const filesToZip = [
    {
        name: 'file_1_archive_name.txt',
        s3Key: 'key/to/my_file_1.txt',
        s3BucketName: 'my-bucket' 
    },
    {
        name: 'file_2_archive_name.txt',
        s3Key: 'key/to/my_file_2.txt',
        s3BucketName: 'my-bucket' 
    },
    {
        s3Key: 'key/to/my_file_3.txt',
        s3BucketName: 'my-bucket' 
        // If `name` is not supplied, setting `preserveFolderStructure` to true
        // will put key/to/my_file_3.txt in the archive.
        // If set to false, ./my_file_3.txt will be placed in the root.
        preserveFolderStructure: true
    },
    {
        // s3ArchiveStream treats 's3Key' ending with a / as directory,
        // and will zip all s3 objects under that path.
        s3Dir: 'key/to/directory/',
        s3BucketName: 'my-bucket',
        // If set to false, key/to/directory/ will be stripped from
        // all s3 objects under this path. However, any folder structures
        // found under key/to/directory/* will be preserved.
        preserveFolderStructure: false
    }
];

const fileStream = fs.createWriteStream('archive.zip');

s3ArchiveStream(new S3Client(), filesToZip).pipe(fileStream);

```

If you want to zip files coming from multiple s3 buckets, simply supply a mapping instead of a single `S3Client`
```ts
import fs from 'fs';
import { s3ArchiveStream } from 's3-archive-stream';

const filesToZip = [
    {
        name: 'file_from_my-bucket-1.txt',
        s3Key: 'key/to/my_file_1.txt',
        s3BucketName: 'my-bucket-1',
    },
    {
        name: 'file_from_my-bucket-2.txt',
        s3Key: 'key/to/my_file_2.txt',
        s3BucketName: 'my-bucket-2',
    },
];

const fileStream = fs.createWriteStream('archive.zip');
const myBucket1Credentials = {};
const myBucket2Credentials = {};

s3ArchiveStream(
    { 'my-bucket-1': new S3Client(myBucket1Credentials), 'my-bucket-2': new S3Client(MyBucket2Credentials) },
    filesToZip,
).pipe(fileStream);

```

### Stream to HTTP Response

Aside from writing the archive stream to file, you can also easily write it to a HTTP GET response. The `example` directory contains a working example of how to use this with `express`.

```ts
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
    s3ArchiveStream(new S3Client(), filesToZip).pipe(res);
});
```

## Examples

You can run the examples in the `example` directory with the following command:
- `npm run example-express` - for writing the archive to a HTTP response as a download
- `npm run example-file` - for writing the archive to file