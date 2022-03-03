// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.patterns.PsiElementPattern
import com.intellij.psi.ElementManipulators
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiReferenceContributor
import com.intellij.psi.PsiReferenceRegistrar
import com.intellij.util.ProcessingContext
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger

class ArnPsiReferenceContributor : PsiReferenceContributor() {
    override fun registerReferenceProviders(registrar: PsiReferenceRegistrar) {
        registrar.registerReferenceProvider(
            object : PsiElementPattern.Capture<PsiElement>(
                PsiElement::class.java
            ) {
                override fun accepts(o: Any?, context: ProcessingContext): Boolean {
                    if (o == null || o !is PsiElement) return false
                    val manipulator = ElementManipulators.getManipulator(o)
                    if (manipulator == null) return false

                    try {
                        val text = o.text
                        val range = manipulator.getRangeInElement(o)
                        if (range.length > text.length || range.endOffset > text.length) {
                            LOG.debug { "Manipulator range: $range doesn't fit in PsiElement text: $text" }
                            return false
                        }
                        if (range.substring(text).contains("arn:")) {
                            return true
                        }
                    } catch (e: Exception) {
                        LOG.error(e) { "Error while checking PsiElement" }
                        return false
                    }

                    return false
                }
            },
            ArnPsiReferenceProvider(),
            PsiReferenceRegistrar.LOWER_PRIORITY
        )
    }

    companion object {
        private val LOG = getLogger<ArnPsiReferenceContributor>()
    }
}
