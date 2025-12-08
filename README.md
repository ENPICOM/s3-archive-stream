# s3-archive-stream

[![Test s3-archive-stream](https://github.com/ENPICOM/s3-archive-stream/actions/workflows/test.yaml/badge.svg)](https://github.com/ENPICOM/s3-archive-stream/actions/workflows/test.yaml) ![NPM Version](https://img.shields.io/npm/v/s3-archive-stream)

A NodeJS utility to stream-zip S3 objects into a single archive using [Archiver](https://www.archiverjs.com/) and the [AWS SDK](https://github.com/aws/aws-sdk-js-v3).

## Motivation

Since there is no native method of AWS to ZIP & download multiple s3 objects from a s3 bucket, a client side solution is required. Although there are some examples out there, many utilities have not been maintained for a long time, or only work in a specific context. `s3-archive-stream`, built with Archiver, tries to fill that gap by providing a very simple function that returns an `archiver.Archiver` stream which can be used to pipe to a target, such as a http response, a file on disk or even a re-upload to S3.

One of the key features of this utility is the support of stream-zipping s3 objects from _multiple s3 buckets_ using multiple `S3Client` instances. This is useful when you for example have a set of credentials per bucket, instead of a single client that has permissions on multiple buckets.


## Installation

```bash
npm install s3-archive-stream
```

## API

```ts
 const archiveStream = s3ArchiveStream(clientOrClients, entries, options);
```
- `clientOrClients: S3Client | Record<string, S3Client>` - S3Client instance or an object mapping of s3BucketName -> S3Client
- `entries: S3ArchiveStreamEntry[]` - The entries to be added to the archive. Can be either files or directory entries. Additionally, [`archiver.EntryData`](https://www.archiverjs.com/docs/archiver#entry-data) options are also available.

    **File**
    ```ts
    {
        s3BucketName: string;
        s3Key: string;
        name?: string;
        preserveFolderStructure?: boolean;
    }
    ```
    **Directory**
    ```ts
    {
        s3BucketName: string;
        s3Dir: string;
        preserveFolderStructure?: boolean;
    }
    ```
- `options.format?: archiver.Format` - Either `'zip'` or `'tar'`
- `options.archiverOptions?: archiver.ArchiverOptions` - [`archiver.ArchiverOptions`](https://www.archiverjs.com/docs/archiver#options)

Returns an `Archiver` instance, for more information and API reference, check [https://www.archiverjs.com/docs/archiver](https://www.archiverjs.com/docs/archiver)

## Basic Usage

`s3-archive-stream` exports a single function `s3ArchiveStream()`, which returns an `archiver.Archiver` stream which can be used to pipe to a target, such as a http response or a file on disk.


### Stream to file

```ts
import { S3Client } from '@aws-sdk/client-s3';
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
        // s3ArchiveStream will zip all s3 objects under the given path.
        s3Dir: 'key/to/directory/',
        s3BucketName: 'my-bucket',
        // If set to false, key/to/directory/ will be stripped from
        // all s3 objects under this path. However, any folder structures
        // found under key/to/directory/* will be preserved.
        preserveFolderStructure: false
    }
];

const fileStream = fs.createWriteStream('example.zip');

s3ArchiveStream(new S3Client(), filesToZip).pipe(fileStream);

```

If you want to zip files coming from multiple s3 buckets, simply supply a mapping instead of a single `S3Client`
```ts
import { S3Client } from '@aws-sdk/client-s3';
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

const fileStream = fs.createWriteStream('example.zip');
const myBucket1Client = new S3Client(myBucket1Credentials);
const myBucket2Client = new S3Client(myBucket2Credentials);

s3ArchiveStream(
    { 'my-bucket-1': myBucket1Client, 'my-bucket-2': myBucket2Client },
    filesToZip,
).pipe(fileStream);

```

### Stream to HTTP Response

Aside from writing the archive stream to file, you can also easily write it to a HTTP GET response. The `example` directory contains a working example of how to use this with `express`.

```ts
import { S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import { s3ArchiveStream } from 's3-archive-stream';

const app = express();
const port = 3000;

app.get('/download-me', (_req, res) => {
    const filesToZip = [
        {
            name: 'file_1_archive_name.txt',
            s3Key: 'key/to/my_file_1.txt',
            s3BucketName: 'my-bucket',
        },
        {
            name: 'file_2_archive_name.txt',
            s3Key: 'key/to/my_file_2.txt',
            s3BucketName: 'my-bucket',
        },
    ];

    // Create the archive stream and directly pipe it to the response
    s3ArchiveStream(new S3Client(), filesToZip).pipe(res);
});

app.listen(port, () => {
    console.log(`Server running, go to http://localhost:${port}/download-me`);
});
```


### Stream back to S3

A third option is to directly stream the archive back to S3, for example using `Upload` from `@aws-sdk/lib-storage`. Simply create a `Passthrough` stream, pipe the archive stream into it and pass the `PassThrough` stream to the `Upload`'s `Body`

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { s3ArchiveStream } from 's3-archive-stream';
import { PassThrough } from 'stream';

const s3 = new S3Client();

// Zip everything under the given prefix
const filesToZip = [
    {
        s3Dir: 'key/to/folder/to/zip/',
        s3BucketName: 'my-bucket',
    },
];

const stream = new PassThrough();
// We can't directly provide the archiver.Archiver object to `Body`,
// so we use a Passthrough stream as intermediate.
s3ArchiveStream(s3, filesToZip).pipe(stream);

const upload = new Upload({
    client: s3,
    params: { Bucket: 'my-bucket', Key: 'example.zip', Body: stream },
});

await upload.done();

```


## Examples

You can run the examples in the `example` directory by running:

1. `docker-compose up -d` to spin up the S3 mock server
2. Choose one of the following tests:
    - `npm run example-express` - for writing the archive to a HTTP response as a download
    - `npm run example-file` - for writing the archive to file
3. `docker-compose down --remove-orphans` to clean up when done

## Tests

You can run the tests by running:

1. `docker-compose up -d` to spin up the S3 mock server
2. `npm run test` to run the tests
3. `docker-compose down --remove-orphans` to clean up when done
