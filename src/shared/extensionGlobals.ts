import { ExtensionContext, OutputChannel } from 'vscode';
import { AWSClientBuilder } from './awsClientBuilder';
import { IRefreshTreeProvider } from './nodes';
import { S3, Lambda } from 'aws-sdk';
/**
 * Namespace for common variables used globally in the extension. 
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let outputChannel: OutputChannel;
    // export let trees: IAWSTreeProvider[];
    export let clientBuilder: AWSClientBuilder;
    export let lambdaClient: Lambda;
    export let s3Client: S3;
    export let treesToRefreshOnRegionChange: IRefreshTreeProvider[];
}
