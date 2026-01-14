/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as semver from 'semver'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import { getSamCliPathAndVersion } from '../utils'
import { getLogger } from '../../logger/logger'
import { openUrl } from '../../utilities/vsCodeUtils'
import { awsClis } from '../../utilities/cliUtils'
import { ToolkitError } from '../../errors'

/**
 * Registry of SAM CLI features and their minimum required versions.
 * This allows us to validate templates before invoking SAM CLI commands
 * and provide clear error messages when features are not supported given
 * current SAM CLI version.
 */

/**
 * Detection rule for identifying features in templates.
 * Each rule specifies how to detect a feature in the template structure.
 */
export interface FeatureDetectionRule {
    /** Check if a resource matches this feature */
    matchResource?: (resourceType: string, properties: any) => boolean
    /** Check if globals section matches this feature */
    matchGlobals?: (globals: any) => boolean
}

export interface SamCliFeature {
    /** Unique identifier for the feature */
    id: string
    /** Human-readable name */
    name: string
    /** Minimum SAM CLI version required */
    minVersion: string
    /** Description of the feature */
    description: string
    /** Detection rules for this feature */
    detectionRule: FeatureDetectionRule
}

/**
 * Registry of SAM CLI features and their version requirements.
 * Add new features here as they are introduced in SAM CLI.
 *
 * To add a new feature:
 * 1. Add a new entry to this registry with detection rules
 * 2. The detection logic will automatically pick it up
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SAM_CLI_FEATURE_REGISTRY: Record<string, SamCliFeature> = {
    CAPACITY_PROVIDER: {
        id: 'CAPACITY_PROVIDER',
        name: '`CapacityProvider`',
        minVersion: '1.149.0',
        description: 'AWS::Serverless::CapacityProvider resource',
        detectionRule: {
            matchResource: (resourceType: string) => resourceType === 'AWS::Serverless::CapacityProvider',
        },
    },
    CAPACITY_PROVIDER_CONFIG: {
        id: 'CAPACITY_PROVIDER_CONFIG',
        name: 'CapacityProviderConfig',
        minVersion: '1.149.0',
        description: 'AWS::Serverless::Function CapacityProviderConfig property',
        detectionRule: {
            matchResource: (resourceType: string, properties: any) =>
                resourceType === 'AWS::Serverless::Function' && !!properties?.CapacityProviderConfig,
            matchGlobals: (globals: any) => !!globals.Function?.CapacityProviderConfig,
        },
    },
} as const

/**
 * Detects SAM CLI features used in a CloudFormation template.
 * This function is completely data-driven - it iterates through all features
 * in the registry and applies their detection rules.
 *
 * Logic:
 * - Automatically fetches SAM CLI version (SAM CLI must be available)
 * - Filters features to only those unsupported by current version before searching
 * - Returns early if no unsupported features exist
 *
 * @param template The parsed CloudFormation template
 * @param samCliVersion Optional SAM CLI version (fetched automatically if not provided)
 * @returns Object containing detected unsupported features and the SAM CLI version used
 */
export async function detectFeaturesInTemplate(
    template: any,
    samCliVersion?: string
): Promise<{ unsupported: SamCliFeature[]; version: string }> {
    const allFeatures = Object.values(SAM_CLI_FEATURE_REGISTRY)

    // Fetch SAM CLI version if not provided
    const version = samCliVersion ?? String((await getSamCliPathAndVersion()).parsedVersion ?? '0.0.0')

    // Step 1: Filter to only features that require a version greater than current
    const unsupportedFeatures = allFeatures.filter((feature) => semver.gt(feature.minVersion, version))

    // Step 2: Early exit if no unsupported features exist
    if (unsupportedFeatures.length === 0) {
        return { unsupported: [], version }
    }

    // Step 3: Search template for only the unsupported features
    const detected: SamCliFeature[] = []
    const resources = template?.Resources ?? {}
    const globals = template?.Globals ?? {}

    for (const feature of unsupportedFeatures) {
        let found = false

        // Check resources if matchResource rule exists
        if (feature.detectionRule.matchResource && !found) {
            for (const resource of Object.values(resources) as any[]) {
                if (feature.detectionRule.matchResource(resource.Type, resource.Properties)) {
                    detected.push(feature)
                    found = true
                    break
                }
            }
        }

        // Check globals if matchGlobals rule exists and not yet found
        if (feature.detectionRule.matchGlobals && !found) {
            if (feature.detectionRule.matchGlobals(globals)) {
                detected.push(feature)
            }
        }
    }

    return { unsupported: detected, version }
}

/**
 * Validates a template file against the current SAM CLI version.
 * Shows a user prompt and throws an error if the template contains unsupported features.
 *
 * @param templateUri URI to the CloudFormation template file
 * @throws Error if template contains features unsupported by current SAM CLI version
 */
export async function validateSamCliVersionForTemplateFile(templateUri: vscode.Uri): Promise<void> {
    const samTemplate = await CloudFormation.tryLoad(templateUri)
    if (!samTemplate.template) {
        return // Template couldn't be loaded, skip validation
    }

    const { unsupported, version } = await detectFeaturesInTemplate(samTemplate.template)

    if (unsupported.length === 0) {
        return // All features are supported
    }

    // Calculate required version
    const requiredVersion = unsupported.reduce(
        (max, feature) => (semver.gt(feature.minVersion, max) ? feature.minVersion : max),
        unsupported[0].minVersion
    )

    const featureList = unsupported.map((f) => `${f.description} (requires ${f.minVersion})`).join(' ')
    const errorMessage = `Your SAM CLI version (${version}) does not support the following features: ${featureList}. Please upgrade to SAM CLI version ${requiredVersion} or higher.`

    getLogger().warn(`SAM CLI version check failed: ${errorMessage}`)
    throw new ToolkitError(errorMessage)
}

export async function showWarningWithSamCliUpdateInstruction(errorMessage: string): Promise<void> {
    // Show user prompt with option to view update instructions
    const updateInstruction = 'View SAM CLI Update Instructions'
    const selection = await vscode.window.showWarningMessage(errorMessage, updateInstruction)

    if (selection === updateInstruction) {
        void openUrl(vscode.Uri.parse(awsClis['sam-cli'].manualInstallLink))
    }
}
