'use strict';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ResourceFetcher } from '../shared/resourceFetcher';
import { ResourceLocation } from '../shared/resourceLocation';
import { DefaultRegionProvider } from '../shared/regions/defaultRegionProvider';

suite("ResourceFetcherBase Tests", function (): void {

    class ResourceFetcherCounter implements ResourceFetcher {
        timesCalled = 0;

        getResource(resourceLocations: ResourceLocation[]): Promise<string> {
            this.timesCalled++;
            return Promise.resolve(JSON.stringify({
                partitions: []
            }));
        }
    }

    class FakeMemento implements vscode.Memento {
        get<T>(key: string): T | undefined; get<T>(key: string, defaultValue: T): T;
        get(key: any, defaultValue?: any) {
            throw new Error("Method not implemented.");
        }
        update(key: string, value: any): Thenable<void> {
            throw new Error("Method not implemented.");
        }
    }

    class FakeExtensionContext implements vscode.ExtensionContext {
        subscriptions: {
            dispose(): any;
        }[] = [];
        workspaceState: vscode.Memento = new FakeMemento();
        globalState: vscode.Memento = new FakeMemento();
        extensionPath: string = "";
        asAbsolutePath(relativePath: string): string {
            throw new Error("Method not implemented.");
        }
        storagePath: string | undefined;
    }

    test('Fetches something', async function () {
        const fetchCounter = new ResourceFetcherCounter();
        const context = new FakeExtensionContext();
        const regionProvider = new DefaultRegionProvider(context, fetchCounter);

        await regionProvider.getRegionData();

        assert.equal(fetchCounter.timesCalled, 1);
    });

    test('Fetches something the first time only', async function () {
        const fetchCounter = new ResourceFetcherCounter();
        const context = new FakeExtensionContext();
        const regionProvider = new DefaultRegionProvider(context, fetchCounter);

        await regionProvider.getRegionData();
        await regionProvider.getRegionData();

        assert.equal(fetchCounter.timesCalled, 1);
    });

});
