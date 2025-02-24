/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import { ToolkitError } from '../../../shared/errors'

interface Implementation {
    iac: string
    runtime: string
    assetName: string
}
interface PatternData {
    name: string
    description: string
    implementation: Implementation[]
}

interface PatternUrls {
    githubUrl: string
    previewUrl: string
}
export interface ProjectMetadata {
    patterns: Record<string, PatternData>
}

/**
 * Manages metadata for serverless application patterns
 */

export class MetadataManager {
    private static instance: MetadataManager
    private metadata: ProjectMetadata | undefined

    private constructor() {}

    public static getInstance(): MetadataManager {
        if (!MetadataManager.instance) {
            MetadataManager.instance = new MetadataManager()
        }
        return MetadataManager.instance
    }

    /**
     * Loads metadata from a JSON file
     * @param metadataPath Path to the metadata JSON file
     * @returns Promise containing the parsed ProjectMetadata
     */
    public async loadMetadata(metadataPath: string): Promise<ProjectMetadata> {
        try {
            if (!this.metadata) {
                const metadataContent = nodefs.readFileSync(metadataPath, { encoding: 'utf-8' })
                const parseMetadata = JSON.parse(metadataContent) as ProjectMetadata
                this.metadata = parseMetadata
            }
            return this.metadata
        } catch (err) {
            throw new ToolkitError(`Failed to load metadata: ${err instanceof Error ? err.message : String(err)}`)
        }
    }

    /**
     * Retrieves available patterns with their descriptions
     * @returns Array of pattern objects containing labels and descriptions
     */
    public getPatterns(): { label: string; description?: string }[] {
        if (!this.metadata) {
            return []
        }
        return Object.entries(this.metadata.patterns).map(([patternName, patternData]) => {
            let description: string | undefined = undefined
            if (typeof patternData === 'string') {
                description = patternData
            } else if (Array.isArray(patternData)) {
                // If description is an array, join it into a single string
                description = patternData.join(' ')
            }
            if (!patternData || !patternData.name) {
                return {
                    label: patternName,
                    description: description || 'No description available',
                }
            }
            return {
                label: patternName,
                description: patternData.description,
            }
        })
    }

    /**
     * Gets available runtimes for a specific pattern
     * @param pattern The pattern name to get runtimes for
     * @returns Array of runtime options with labels
     */
    public getRuntimes(pattern: string): { label: string }[] {
        const patternData = this.metadata?.patterns?.[pattern]
        if (!patternData || !patternData.implementation) {
            return []
        }
        const uniqueRuntimes = new Set(patternData.implementation.map((item) => item.runtime))
        return Array.from(uniqueRuntimes).map((runtime) => ({
            label: runtime,
        }))
    }

    public getUrl(pattern: string): PatternUrls {
        const patternData = this.metadata?.patterns?.[pattern]
        if (!patternData || !patternData.implementation) {
            return {
                githubUrl: '',
                previewUrl: '',
            }
        }
        const asset = patternData.implementation[0].assetName

        return {
            // GitHub URL for the pattern
            githubUrl: `https://github.com/aws-samples/serverless-patterns/tree/main/${asset}`,
            // Serverless Land preview URL
            previewUrl: `https://serverlessland.com/patterns/${asset}`,
        }
    }

    /**
     * Gets available Infrastructure as Code options for a specific pattern
     * @param pattern The pattern name to get IaC options for
     * @returns Array of IaC options with labels
     */
    public getIacOptions(pattern: string): { label: string }[] {
        const patternData = this.metadata?.patterns?.[pattern]
        if (!patternData || !patternData.implementation) {
            return []
        }
        const uniqueIaCs = new Set(patternData.implementation.map((item) => item.iac))
        return Array.from(uniqueIaCs).map((iac) => ({
            label: iac,
        }))
    }
    public getAssetName(selectedPattern: string, selectedRuntime: string, selectedIaC: string): string {
        const patternData = this.metadata?.patterns?.[selectedPattern]
        if (!patternData || !patternData.implementation) {
            return ''
        }
        const matchingImplementation = patternData.implementation.find(
            (impl) => impl.runtime === selectedRuntime && impl.iac === selectedIaC
        )
        return matchingImplementation?.assetName ?? ''
    }
}
