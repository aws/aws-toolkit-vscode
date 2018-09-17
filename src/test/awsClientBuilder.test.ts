import * as assert from 'assert';
import * as vscode from 'vscode';
import { ContextChangeEventsArgs } from '../shared/defaultAwsContext';
import { AwsContext } from '../shared/awsContext';
import { AWSClientBuilder } from '../shared/awsClientBuilder';

suite('AwsClientBuilder Tests', () => {
    class FakeAwsContext implements AwsContext {
        onDidChangeContext: vscode.Event<ContextChangeEventsArgs> = new vscode.EventEmitter<ContextChangeEventsArgs>().event;
        getCredentials(): Promise<AWS.Credentials | undefined> {
            return Promise.resolve(undefined);
        }
        getCredentialProfileName(): string | undefined {
            throw new Error('Method not implemented.');
        }
        setCredentialProfileName(profileName?: string | undefined): Promise<void> {
            throw new Error('Method not implemented.');
        }
        getExplorerRegions(): Promise<string[]> {
            throw new Error('Method not implemented.');
        }
        addExplorerRegion(region: string | string[]): Promise<void> {
            throw new Error('Method not implemented.');
        }
        removeExplorerRegion(region: string | string[]): Promise<void> {
            throw new Error('Method not implemented.');
        }
    }

    class FakeService {
        constructor(public config: any) {
        }
    }

    test('createAndConfigureSdkClient includes custom user-agent if no options are specified', async () => {
        const builder = new AWSClientBuilder(new FakeAwsContext());
        const service = await builder.createAndConfigureSdkClient(FakeService);
            
        assert.equal(service.config.customUserAgent, 'AWS-Toolkit-For-VisualStudio/0.0.1 Visual-Studio-Code/1.27.2');
    });

    test('createAndConfigureSdkClient includes custom user-agent if not specified in options', async () => {
        const builder = new AWSClientBuilder(new FakeAwsContext());
        const service = await builder.createAndConfigureSdkClient(FakeService, {});

        assert.equal(service.config.customUserAgent, 'AWS-Toolkit-For-VisualStudio/0.0.1 Visual-Studio-Code/1.27.2');
    });

    test('createAndConfigureSdkClient does not override custom user-agent if specified in options', async () => {
        const builder = new AWSClientBuilder(new FakeAwsContext());
        const service = await builder.createAndConfigureSdkClient(FakeService, { customUserAgent: 'CUSTOM USER AGENT' });

        assert.equal(service.config.customUserAgent, 'CUSTOM USER AGENT');
    });
});
