// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.search.locators.Locator
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.utils.Locators

object LocatorsExt {
    fun byType(clsName: String,): Locator = byXpath(
        "by type $clsName",
        """//div[@javaclass="$clsName" or contains(@classhierarchy, "$clsName ") or contains(@classhierarchy, " $clsName ")]"""
    )

    fun byTypeAndProperties(
        clsName: String,
        property: Pair<Locators.XpathProperty, String>,
        vararg properties: Pair<Locators.XpathProperty, String>
    ): Locator {
        val allProperties = listOf(property, *properties)
        val joinedProperties = allProperties.joinToString(" and ") { "${it.first.title}=\"${it.second}\"" }.let {
            if (allProperties.isNotEmpty()) {
                " and $it"
            } else {
                it
            }
        }
        return byXpath(
            "by type $clsName properties ${allProperties.joinToString(",") { "(${it.first.title}, ${it.second})" }}",
            """//div[(@javaclass="$clsName" or contains(@classhierarchy, "$clsName ") or contains(@classhierarchy, " $clsName "))$joinedProperties]"""
        )
    }

    fun byTypeAndPropertiesContains(
        clsName: String,
        property: Pair<Locators.XpathProperty, String>,
        vararg properties: Pair<Locators.XpathProperty, String>
    ): Locator {
        val allProperties = listOf(property, *properties)
        val joinedProperties =
            allProperties.joinToString(" and ") { "contains(${it.first.title}, \"${it.second}\")" }.let {
                if (allProperties.isNotEmpty()) {
                    " and $it"
                } else {
                    it
                }
            }
        return byXpath(
            "by type $clsName properties ${allProperties.joinToString(",") { "(${it.first.title}, ${it.second})" }}",
            """//div[(@javaclass="$clsName" or contains(@classhierarchy, "$clsName ") or contains(@classhierarchy, " $clsName "))$joinedProperties]"""
        )
    }
}
