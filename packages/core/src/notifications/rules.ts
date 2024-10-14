/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import globals from '../shared/extensionGlobals'
import { ConditionalClause, RuleContext, DisplayIf, CriteriaCondition, ToolkitNotification } from './types'

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
    switch (condition.type) {
        case 'range': {
            const lowerConstraint = !condition.lowerInclusive || semver.gte(version, condition.lowerInclusive)
            const upperConstraint = !condition.upperExclusive || semver.lt(version, condition.upperExclusive)
            return lowerConstraint && upperConstraint
        }
        case 'exactMatch':
            return condition.values.some((v) => semver.eq(v, version))
        case 'or':
            /** Check case where any of the subconditions are true, i.e. one of multiple range or exactMatch conditions */
            return condition.clauses.some((clause) => isValidVersion(version, clause))
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
        return this.evaluate(payload.displayIf)
    }

    private evaluate(condition: DisplayIf): boolean {
        if (condition.extensionId !== globals.context.extension.id) {
            return false
        }

        if (condition.ideVersion) {
            if (!isValidVersion(this.context.ideVersion, condition.ideVersion)) {
                return false
            }
        }
        if (condition.extensionVersion) {
            if (!isValidVersion(this.context.extensionVersion, condition.extensionVersion)) {
                return false
            }
        }

        if (condition.additionalCriteria) {
            for (const criteria of condition.additionalCriteria) {
                if (!this.evaluateRule(criteria)) {
                    return false
                }
            }
        }

        return true
    }

    private evaluateRule(criteria: CriteriaCondition) {
        const expected = criteria.values
        const expectedSet = new Set(expected)

        const isExpected = (i: string) => expectedSet.has(i)
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
                return isExpected(this.context.os)
            case 'ComputeEnv':
                return isExpected(this.context.computeEnv)
            case 'AuthType':
                return hasAnyOfExpected(this.context.authTypes)
            case 'AuthRegion':
                return hasAnyOfExpected(this.context.authRegions)
            case 'AuthState':
                return hasAnyOfExpected(this.context.authStates)
            case 'AuthScopes':
                return isEqualSetToExpected(this.context.authScopes)
            case 'InstalledExtensions':
                return isSuperSetOfExpected(this.context.installedExtensions)
            case 'ActiveExtensions':
                return isSuperSetOfExpected(this.context.activeExtensions)
            default:
                throw new Error(`Unknown criteria type: ${criteria.type}`)
        }
    }
}
