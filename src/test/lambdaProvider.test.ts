import * as assert from 'assert';
import * as AWS from 'aws-sdk';
import * as vscode from 'vscode';
import { LambdaProvider } from '../lambda/lambdaProvider';
import { RegionNode } from '../lambda/explorer/regionNode';
import { ContextChangeEventsArgs } from '../shared/defaultAwsContext';
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection';
import { AwsContext } from '../shared/awsContext';
import { RegionInfo } from '../shared/regions/regionHelpers';
import { RegionProvider } from '../shared/regions/regionProvider';

suite("LambdaProvider Tests", function (): void {

    test('region nodes display the user-friendly region name', function () {

        const regionCode = "regionQuerty";
        const regionName = "The Querty Region";

        // TODO : Introduce Mocking instead of stub implementations
        class FakeRegionProvider implements RegionProvider {
            fetchLatestRegionData(): Promise<RegionInfo[]> {
                return Promise.resolve([new RegionInfo(regionCode, regionName)]);
            }
        }

        class FakeAwsContext implements AwsContext {
            onDidChangeContext: vscode.Event<ContextChangeEventsArgs> = new vscode.EventEmitter<ContextChangeEventsArgs>().event;
            getCredentials(): Promise<AWS.Credentials | undefined> {
                throw new Error("Method not implemented.");
            }
            getCredentialProfileName(): string | undefined {
                return "qwerty";
            }
            setCredentialProfileName(profileName?: string | undefined): Promise<void> {
                throw new Error("Method not implemented.");
            }
            getExplorerRegions(): Promise<string[]> {
                const regions = [];
                regions.push(regionCode);

                return Promise.resolve(regions);
            }
            addExplorerRegion(region: string | string[]): Promise<void> {
                throw new Error("Method not implemented.");
            }
            removeExplorerRegion(region: string | string[]): Promise<void> {
                throw new Error("Method not implemented.");
            }
        }

        const awsContext = new FakeAwsContext();
        const regionProvider = new FakeRegionProvider();
        const awsContextTreeCollection = new AwsContextTreeCollection();

        const lambdaProvider = new LambdaProvider(awsContext, awsContextTreeCollection, regionProvider);

        const treeNodes = lambdaProvider.getChildren();

        assert(treeNodes);
        treeNodes.then(treeNodes => {
            assert(treeNodes);
            assert.equal(treeNodes.length, 1);

            const regionNode = treeNodes[0] as RegionNode;
            assert(regionNode);
            assert.equal(regionNode.regionCode, regionCode);
            assert.equal(regionNode.regionName, regionName);
        });
    });
});