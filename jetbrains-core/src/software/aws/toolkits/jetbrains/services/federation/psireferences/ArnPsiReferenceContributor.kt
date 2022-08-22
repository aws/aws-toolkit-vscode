// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.patterns.PsiElementPattern
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiLiteralValue
import com.intellij.psi.PsiReferenceContributor
import com.intellij.psi.PsiReferenceRegistrar
import com.intellij.util.ProcessingContext

class ArnPsiReferenceContributor : PsiReferenceContributor() {
    override fun registerReferenceProviders(registrar: PsiReferenceRegistrar) {
        registrar.registerReferenceProvider(
            object : PsiElementPattern.Capture<PsiElement>(
                PsiElement::class.java
            ) {
                override fun accepts(o: Any?, context: ProcessingContext): Boolean =
                    // this is lower fidelity than we'd like but avoids resolving the entire PSI tree
                    o is PsiLiteralValue && o.value is String
            },
            ArnPsiReferenceProvider(),
            PsiReferenceRegistrar.LOWER_PRIORITY
        )
    }
}
