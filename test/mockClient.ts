import {
    GetObjectCommand,
    ListObjectsV2Command,
    type S3ClientResolvedConfig,
    type ServiceInputTypes,
    type ServiceOutputTypes,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import type { AwsStub } from 'aws-sdk-client-mock';
import fs from 'fs';

export function addS3MockCommands(
    mockedClient: AwsStub<ServiceInputTypes, ServiceOutputTypes, S3ClientResolvedConfig>,
    mockedBucket: Record<string, string[]>,
) {
    mockedClient.on(GetObjectCommand).callsFake((i: { Bucket: string; Key: string }) => {
        return {
            Body: sdkStreamMixin(
                fs.createReadStream(`./test/${i.Bucket}/${mockedBucket[i.Bucket].find((f) => f === i.Key)}`),
            ),
        };
    });
    mockedClient.on(ListObjectsV2Command).callsFake((i) => {
        return {
            IsTruncated: false,
            Contents: mockedBucket[i.Bucket].filter((f) => f.startsWith(i.Prefix)).map((f) => ({ Key: f })),
        };
    });
}
