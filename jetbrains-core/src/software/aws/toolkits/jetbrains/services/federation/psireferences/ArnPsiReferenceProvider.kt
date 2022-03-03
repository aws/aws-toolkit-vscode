// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.openapi.util.TextRange
import com.intellij.psi.ElementManipulators
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiReference
import com.intellij.psi.PsiReferenceProvider
import com.intellij.util.ProcessingContext

class ArnPsiReferenceProvider : PsiReferenceProvider() {
    // these results should probably be cached with [CachedValuesManager]
    override fun getReferencesByElement(element: PsiElement, context: ProcessingContext): Array<PsiReference> {
        val manipulator = ElementManipulators.getManipulator(element)
        if (manipulator != null) {
            val range = manipulator.getRangeInElement(element)
            // TODO: we can definitely make this more robust
            // assume this was a string that was quoted
            if (range.length == element.textRange.length - 2) {
                val substring = range.substring(element.text)
                if (substring.startsWith("arn:")) {
                    // don't do anything fancy and just treat it as a full match
                    return arrayOf(ArnReference(element, range, substring))
                }
            }
        }

        val matches = ARN_REGEX.findAll(element.text)
        return matches.map {
            ArnReference(
                element,
                TextRange.from(it.range.start, it.value.length),
                it.value
            )
        }.toList().toTypedArray()
    }

    companion object {
        //            partition  service   region  account     (optional)
        //                   v         v      v     v      resource-type         resource
        val ARN_REGEX = "arn:aws[^/:]*:[^/:]*:[^:]*:[^/:]*:(?:[^:\\s\\/]*[:\\/])?(?:[^\\s'\\\"\\\\]*)".toRegex()
    }
}
