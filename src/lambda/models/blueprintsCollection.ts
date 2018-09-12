'use strict';

import xml2js = require('xml2js');
import path = require('path');
import { hostedFilesBaseUrl } from "../../shared/constants";
import { blueprintsManifestPath } from "../constants";
import { ResourceFetcher } from "../../shared/resourceFetcher";
import { Blueprint, BlueprintOrigin } from "./blueprint";
import { ExtensionContext } from 'vscode';
import { WebResourceLocation, FileResourceLocation } from '../../shared/resourceLocation';

// Represents a collection of blueprints, potentially from multiple sources
export class BlueprintsCollection {

    private availableBlueprints: Blueprint[] = [];
    private readonly _context: ExtensionContext;
    private readonly _resourceFetcher: ResourceFetcher;

    constructor(context: ExtensionContext, resourceFetcher: ResourceFetcher) {
        this._context = context;
        this._resourceFetcher = resourceFetcher;
    }

    public async loadAllBlueprints(): Promise<void> {
        this.availableBlueprints = [];
        await this.loadVisualStudioBlueprints();
        // TODO: load additional blueprints from SAR?
    }

    // Evaluates the various tags to determine what languages we have blueprints
    // available for. This does rely on us normalizing all blueprint data sources
    // at load time.
    public filterBlueprintLanguages(): string[] {
        let languages: string[] = [];

        // hack for now! Unfortunately language is encoded in amongst other tag
        // values for VS
        languages.push('C#');
        languages.push('F#');

        return languages;
    }

    public filterBlueprintsForLanguage(language: string): Blueprint[] {
        let filteredBlueprints: Blueprint[] = [];

        this.availableBlueprints.forEach((b: Blueprint) => {
            if (b.isForLanguage(language)) {
                filteredBlueprints.push(b);
            }
        });

        return filteredBlueprints;
    }

    private async loadVisualStudioBlueprints(): Promise<void> {
        const manifestUrl = hostedFilesBaseUrl + blueprintsManifestPath;
        await this.listBlueprintsVSToolkitFromManifest(manifestUrl)
            .then(results => {
                results.forEach((b: Blueprint) => {
                    this.availableBlueprints.push(b);
            });
        });
    }

    private async listBlueprintsVSToolkitFromManifest(manifestUrl: string): Promise<Blueprint[]> {
        const resourcePath = path.join(this._context.extensionPath, 'resources', 'vs-lambda-blueprint-manifest.xml');
        const manifest = await this._resourceFetcher.getResource([new WebResourceLocation(manifestUrl), new FileResourceLocation(resourcePath)]);
        return new Promise<Blueprint[]>((resolve, reject) => {
            xml2js.parseString(manifest, {explicitArray: false}, function (err, result) {
                if (err) {
                    // TODO: fall back to resource version before giving up
                    reject(err);
                } else {
                    // this is a short term hack to figure out how to do this!
                    let blueprints: Blueprint[] = [];
                    (result.BlueprintManifest.Blueprints.Blueprint).forEach((b: any) => {
                        const blueprint = new Blueprint(b.Name, b.Description, b.File, BlueprintOrigin.vsToolkit);

                        // post optional data
                        if (b.SortOrder) {
                            blueprint.sortOrder = b.SortOrder;
                        }

                        // both tag collections could have deserialized as one string or an array
                        if (b.Tags && b.Tags.Tag) {
                            blueprint.tags = BlueprintsCollection.stringOrArrayToStringArray(b.Tags.Tag);
                        }
                        if (b.HiddenTags && b.HiddenTags.HiddenTag) {
                            blueprint.hiddenTags = BlueprintsCollection.stringOrArrayToStringArray(b.HiddenTags.HiddenTag);
                        }

                        blueprints.push(blueprint);
                    });
                    resolve(blueprints);
                }
            });
        });
    }

    private static stringOrArrayToStringArray(input: string | string[]): string[] {
        let output: string[] = [];
        if (Array.isArray(input)){
            input.forEach((i:any) => {
                output.push(i);
            });
        } else {
            output.push(input);
        }
        return output;
    }
}