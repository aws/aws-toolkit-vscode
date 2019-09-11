// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.RuleSet
import com.pinterest.ktlint.core.RuleSetProvider
import com.pinterest.ktlint.ruleset.standard.NoWildcardImportsRule

class CustomRuleSetProvider : RuleSetProvider {
    override fun get() = RuleSet(
        "custom-ktlint-rules",
        CopyrightHeaderRule(),
        BannedPatternRule(BannedPatternRule.DEFAULT_PATTERNS),
        ExpressionBodyRule(),
        LazyLogRule(),
        DialogModalityRule(),
        NoWildcardImportsRule() // Disabled by default, so including in our rule set
    )
}
