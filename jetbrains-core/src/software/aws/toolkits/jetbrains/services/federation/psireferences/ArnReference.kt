// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.paths.WebReference
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.SyntheticElement
import com.intellij.psi.impl.FakePsiElement
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettings
import software.aws.toolkits.jetbrains.services.federation.AwsConsoleUrlFactory
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.resources.message

class ArnReference(element: PsiElement, textRange: TextRange, private val arn: String) : WebReference(element, textRange) {
    inner class MyFakePsiElement : FakePsiElement(), SyntheticElement {
        override fun getName() = arn
        override fun getParent() = element
        override fun getPresentableText() = arn

        override fun navigate(requestFocus: Boolean) {
            val project = element.project
            val connectionSettings = project.getConnectionSettings()

            if (connectionSettings == null) {
                notifyNoActiveCredentialsError(project)
                return
            }

            val (credProvider, region) = connectionSettings
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    BrowserUtil.browse(AwsConsoleUrlFactory().getSigninUrl(credProvider.resolveCredentials(), "/go/view/$arn", region))
                } catch (e: Exception) {
                    val message = message("general.open_in_aws_console.error")
                    notifyError(content = message, project = project)
                    getLogger<ArnReference>().error(e) { message }
                }
            }
        }
    }
    override fun resolve() = MyFakePsiElement()
}
