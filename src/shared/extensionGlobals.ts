'use strict';

import { ExtensionContext, OutputChannel } from 'vscode';
import { AWSClientBuilder } from './awsClientBuilder';
import { AWSStatusBar } from './statusBar';
import { AWSContextCommands } from './awsContextCommands';

/**
 * Namespace for common variables used globally in the extension.
 * All variables here must be initialized in the activate() method of extension.ts
 */
export namespace ext {
    export let context: ExtensionContext;
    export let outputChannel: OutputChannel;
    export let awsContextCommands: AWSContextCommands;
    export let sdkClientBuilder: AWSClientBuilder;
    export let statusBar: AWSStatusBar;
}
