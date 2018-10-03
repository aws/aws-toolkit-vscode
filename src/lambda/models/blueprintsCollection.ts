/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import path = require('path')
import { ExtensionContext } from 'vscode'
import xml2js = require('xml2js')
import { hostedFilesBaseUrl } from '../../shared/constants'
import { ResourceFetcher } from '../../shared/resourceFetcher'
import { FileResourceLocation, WebResourceLocation } from '../../shared/resourceLocation'
import { blueprintsManifestPath } from '../constants'
import { Blueprint, BlueprintOrigin } from './blueprint'

interface RawBlueprint {
    Name: string
    Description: string
    File: string
    SortOrder?: number
    Tags?: {
        Tag: string | string[]
    }
    HiddenTags?: {
        HiddenTag: string | string[]
    }
}

interface BlueprintManifest {
    BlueprintManifest: {
        Blueprints: {
            Blueprint: RawBlueprint[]
        }
    }
}

// Represents a collection of blueprints, potentially from multiple sources
export class BlueprintsCollection {

    private availableBlueprints: Blueprint[] = []
    private readonly _context: ExtensionContext
    private readonly _resourceFetcher: ResourceFetcher

    public constructor(context: ExtensionContext, resourceFetcher: ResourceFetcher) {
        this._context = context
        this._resourceFetcher = resourceFetcher
    }

    public async loadAllBlueprints(): Promise<void> {
        this.availableBlueprints = []
        await this.loadVisualStudioBlueprints()
        // TODO: load additional blueprints from SAR?
    }

    // Evaluates the various tags to determine what languages we have blueprints
    // available for. This does rely on us normalizing all blueprint data sources
    // at load time.
    public filterBlueprintLanguages(): string[] {
        const languages: string[] = []

        // hack for now! Unfortunately language is encoded in amongst other tag
        // values for VS
        languages.push('C#')
        languages.push('F#')

        return languages
    }

    public filterBlueprintsForLanguage(language: string): Blueprint[] {
        const filteredBlueprints: Blueprint[] = []

        this.availableBlueprints.forEach((b: Blueprint) => {
            if (b.isForLanguage(language)) {
                filteredBlueprints.push(b)
            }
        })

        return filteredBlueprints
    }

    private async loadVisualStudioBlueprints(): Promise<void> {
        const manifestUrl = hostedFilesBaseUrl + blueprintsManifestPath
        const results = await this.listBlueprintsVSToolkitFromManifest(manifestUrl)

        results.forEach((b: Blueprint) => this.availableBlueprints.push(b))
    }

    private async listBlueprintsVSToolkitFromManifest(manifestUrl: string): Promise<Blueprint[]> {
        const resourcePath = path.join(this._context.extensionPath, 'resources', 'vs-lambda-blueprint-manifest.xml')
        const manifest = await this._resourceFetcher.getResource([
            new WebResourceLocation(manifestUrl),
            new FileResourceLocation(resourcePath)
        ])

        return new Promise<Blueprint[]>((resolve, reject) => {
            xml2js.parseString(manifest, {explicitArray: false}, (err, result: BlueprintManifest) => {
                if (err) {
                    // TODO: fall back to resource version before giving up
                    reject(err)
                } else {
                    const blueprints: Blueprint[] = (result.BlueprintManifest.Blueprints.Blueprint).map(b => {
                        const blueprint = new Blueprint(b.Name, b.Description, b.File, BlueprintOrigin.vsToolkit)

                        // post optional data
                        if (b.SortOrder) {
                            blueprint.sortOrder = b.SortOrder
                        }

                        // both tag collections could have deserialized as one string or an array
                        if (b.Tags && b.Tags.Tag) {
                            blueprint.tags = BlueprintsCollection.stringOrArrayToStringArray(b.Tags.Tag)
                        }
                        if (b.HiddenTags && b.HiddenTags.HiddenTag) {
                            blueprint.hiddenTags = BlueprintsCollection.stringOrArrayToStringArray(
                                b.HiddenTags.HiddenTag
                            )
                        }

                        return blueprint
                    })

                    resolve(blueprints)
                }
            })
        })
    }

    private static stringOrArrayToStringArray(input: string | string[]): string[] {
        return Array.isArray(input) ? [ ...input ] : [ input ]
    }
}
