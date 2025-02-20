/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import { ToolkitError } from '../../../shared/errors'

interface IaC {
    id: string
    name: string
}
interface Runtime {
    id: string
    name: string
    version: string
}
interface PatternData {
    name: string
    description: string
    runtimes: Runtime[]
    iac: IaC[]
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
        if (!patternData || !patternData.runtimes) {
            return []
        }
        return patternData.runtimes.map((runtime) => ({
            label: runtime.name,
        }))
    }

    /**
     * Gets available Infrastructure as Code options for a specific pattern
     * @param pattern The pattern name to get IaC options for
     * @returns Array of IaC options with labels
     */
    public getIacOptions(pattern: string): { label: string }[] {
        const patternData = this.metadata?.patterns?.[pattern]
        if (!patternData || !patternData.iac) {
            return []
        }
        return patternData.iac.map((iac) => ({
            label: iac.name,
        }))
    }
}
