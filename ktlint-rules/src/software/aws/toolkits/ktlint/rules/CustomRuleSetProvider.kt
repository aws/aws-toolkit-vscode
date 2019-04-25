// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.github.shyiko.ktlint.core.RuleSet
import com.github.shyiko.ktlint.core.RuleSetProvider

class CustomRuleSetProvider : RuleSetProvider {
    override fun get() = RuleSet(
        "custom-ktlint-rules",
        CopyrightHeaderRule(),
        BannedPatternRule(BannedPatternRule.DEFAULT_PATTERNS),
        ExpressionBodyRule(),
        LazyLogRule(),
        DialogModalityRule()
    )
}