// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.RuleSet
import io.gitlab.arturbosch.detekt.api.RuleSetProvider

class CustomRuleSetProvider : RuleSetProvider {
    override val ruleSetId: String = "CustomDetektRules"
    override fun instance(config: Config): RuleSet = RuleSet(
        ruleSetId,
        listOf(
            BannedPatternRule(BannedPatternRule.DEFAULT_PATTERNS),
            LazyLogRule(),
            DialogModalityRule(),
            BannedImportsRule()
        )
    )
}
