// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.completion

import com.intellij.codeInsight.completion.PrefixMatcher
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject

interface HandlerCompletion {

    /**
     * Get a collection of lookup elements with a presentation to show in lookup popup
     *
     * @return [Collection] of [LookupElement]'s to show in a completion popup
     */
    fun getLookupElements(project: Project): Collection<LookupElement>

    /**
     * Define a prefix matcher for a handler completion
     *
     * @param prefix [String] - prefix for a completion string
     * @return [PrefixMatcher] instance with a defined prefix matching
     */
    fun getPrefixMatcher(prefix: String): PrefixMatcher

    companion object : RuntimeGroupExtensionPointObject<HandlerCompletion>(ExtensionPointName("aws.toolkit.lambda.handlerCompletion"))
}
