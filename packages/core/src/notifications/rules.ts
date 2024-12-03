/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as semver from 'semver'
import globals from '../shared/extensionGlobals'
import { ConditionalClause, RuleContext, DisplayIf, CriteriaCondition, ToolkitNotification, AuthState } from './types'
import { getComputeEnvType, getOperatingSystem } from '../shared/telemetry/util'
import { isAutomation } from '../shared/vscode/env'
import { AuthFormId } from '../login/webview/vue/types'
import { getLogger } from '../shared/logger/logger'
import { ToolkitError } from '../shared/errors'

const logger = getLogger('notifications')
/**
 * Evaluates if a given version fits into the parameters specified by a notification, e.g:
 *
 *  extensionVersion: {
 *      type: 'range',
 *      lowerInclusive: '1.21.0'
 *  }
 *
 * will match all versions 1.21.0 and up.
 *
 * @param version the version to check
 * @param condition the condition to check against
 * @returns true if the version satisfies the condition
 */
function isValidVersion(version: string, condition: ConditionalClause): boolean {
    const cleanVersion = version.split('-')[0] // remove any pre-release tags
    switch (condition.type) {
        case 'range': {
            const lowerConstraint =
                !condition.lowerInclusive ||
                condition.lowerInclusive === '-inf' ||
                semver.gte(cleanVersion, condition.lowerInclusive)
            const upperConstraint =
                !condition.upperExclusive ||
                condition.upperExclusive === '+inf' ||
                semver.lt(cleanVersion, condition.upperExclusive)
            return lowerConstraint && upperConstraint
        }
        case 'exactMatch':
            return condition.values.some((v) => semver.eq(v, cleanVersion))
        case 'or':
            /** Check case where any of the subconditions are true, i.e. one of multiple range or exactMatch conditions */
            return condition.clauses.some((clause) => isValidVersion(cleanVersion, clause))
        default:
            throw new Error(`Unknown clause type: ${(condition as any).type}`)
    }
}

/**
 * Determine whether or not to display a given notification based on whether the
 * notification requirements fit the extension context provided on initialization.
 *
 * Usage:
 * const myContext = {
 *   extensionVersion: '4.5.6',
 *   ...
 * }
 *
 * const ruleEngine = new RuleEngine(myContext)
 *
 * notifications.forEach(n => {
 *   if (ruleEngine.shouldDisplayNotification(n)) {
 *     // process notification
 *     ...
 *   }
 * })
 *
 */
export class RuleEngine {
    constructor(private readonly context: RuleContext) {}

    public shouldDisplayNotification(payload: ToolkitNotification) {
        return this.evaluate(payload.id, payload.displayIf)
    }

    private evaluate(id: string, condition: DisplayIf): boolean {
        const currentExt = globals.context.extension.id
        // if in test, skip the extension id check since its fake
        if (condition.extensionId !== currentExt && !isAutomation()) {
            logger.verbose(
                'notification id: (%s) did NOT pass extension id check, actual ext id: (%s), expected ext id: (%s)',
                id,
                currentExt,
                condition.extensionId
            )
            return false
        }

        if (condition.ideVersion) {
            if (!isValidVersion(this.context.ideVersion, condition.ideVersion)) {
                logger.verbose(
                    'notification id: (%s) did NOT pass IDE version check, actual version: (%s), expected version: (%s)',
                    id,
                    this.context.ideVersion,
                    condition.ideVersion
                )
                return false
            }
        }
        if (condition.extensionVersion) {
            if (!isValidVersion(this.context.extensionVersion, condition.extensionVersion)) {
                logger.verbose(
                    'notification id: (%s) did NOT pass extension version check, actual ext version: (%s), expected ext version: (%s)',
                    id,
                    this.context.extensionVersion,
                    condition.extensionVersion
                )
                return false
            }
        }

        if (condition.additionalCriteria) {
            for (const criteria of condition.additionalCriteria) {
                if (!this.evaluateRule(criteria)) {
                    logger.verbose('notification id: (%s) did NOT pass criteria check: %O', id, criteria)
                    return false
                }
                logger.debug('notification id: (%s) passed criteria check: %O', id, criteria)
            }
        }

        return true
    }

    private evaluateRule(criteria: CriteriaCondition) {
        const expected = criteria.values
        const expectedSet = new Set(expected)

        const hasAnyOfExpected = (i: string[]) => i.some((v) => expectedSet.has(v))
        const isSuperSetOfExpected = (i: string[]) => {
            const s = new Set(i)
            return expected.every((v) => s.has(v))
        }
        const isEqualSetToExpected = (i: string[]) => {
            const s = new Set(i)
            return expected.every((v) => s.has(v)) && i.every((v) => expectedSet.has(v))
        }

        // Maybe we could abstract these out into some strategy pattern with classes.
        // But this list is short and its unclear if we need to expand it further.
        // Also, we might replace this with a common implementation amongst the toolkits.
        // So... YAGNI
        switch (criteria.type) {
            case 'OS':
                return hasAnyOfExpected([this.context.os])
            case 'ComputeEnv':
                return hasAnyOfExpected([this.context.computeEnv])
            case 'AuthType':
                return hasAnyOfExpected(this.context.authTypes)
            case 'AuthRegion':
                return hasAnyOfExpected(this.context.authRegions)
            case 'AuthState':
                return hasAnyOfExpected(this.context.authStates)
            case 'AuthScopes':
                return isEqualSetToExpected(this.context.authScopes)
            case 'ActiveExtensions':
                return isSuperSetOfExpected(this.context.activeExtensions)
            default:
                logger.error('Unknown criteria passed to RuleEngine: %O', criteria)
                throw new ToolkitError(`Unknown criteria type: ${(criteria as any).type}`)
        }
    }
}

export async function getRuleContext(context: vscode.ExtensionContext, authState: AuthState): Promise<RuleContext> {
    const authTypes =
        authState.authEnabledConnections === ''
            ? []
            : // TODO: There is a large disconnect in the codebase with how auth "types" are stored, displayed, sent to telemetry, etc.
              // For now we have this "hack" (more of an inefficiency) until auth code can be properly refactored.
              (authState.authEnabledConnections.split(',') as AuthFormId[]).map(
                  (id): RuleContext['authTypes'][number] => {
                      if (id.includes('builderId')) {
                          return 'builderId'
                      } else if (id.includes('identityCenter')) {
                          return 'identityCenter'
                      } else if (id.includes('credentials')) {
                          return 'credentials'
                      }
                      return 'unknown'
                  }
              )
    const ruleContext = {
        ideVersion: vscode.version,
        extensionVersion: context.extension.packageJSON.version,
        os: getOperatingSystem(),
        computeEnv: await getComputeEnvType(),
        authTypes: [...new Set(authTypes)],
        authScopes: authState.authScopes ? authState.authScopes?.split(',') : [],
        activeExtensions: vscode.extensions.all.filter((e) => e.isActive).map((e) => e.id),

        // Toolkit (and eventually Q?) may have multiple connections with different regions and states.
        // However, this granularity does not seem useful at this time- only the active connection is considered.
        authRegions: authState.awsRegion ? [authState.awsRegion] : [],
        authStates: [authState.authStatus],
    }

    const { activeExtensions, ...loggableRuleContext } = ruleContext
    logger.debug('getRuleContext() determined rule context: %O', loggableRuleContext)

    return ruleContext
}
