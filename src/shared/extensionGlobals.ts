import { ExtensionContext, OutputChannel } from 'vscode';
import { AWSClientBuilder } from './awsClientBuilder';
import { AWSContext } from './awsContext';
import { IRefreshableAWSTreeProvider } from './nodes';

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let outputChannel: OutputChannel;
    export let awsContext: AWSContext;
    export let sdkClientBuilder: AWSClientBuilder;
    export let treesToRefreshOnContextChange: IRefreshableAWSTreeProvider[] = [];
}
