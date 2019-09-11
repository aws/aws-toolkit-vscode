// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.lang.java.JavaLanguage
import com.intellij.openapi.module.JavaModuleType
import com.intellij.openapi.module.ModuleType
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.projectRoots.JavaSdkType
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkType
import com.intellij.pom.java.LanguageLevel
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedRuntimeGroupInformation

class JavaRuntimeGroup : SdkBasedRuntimeGroupInformation() {
    override val runtimes = setOf(Runtime.JAVA8)
    override val languageIds = setOf(JavaLanguage.INSTANCE.id)

    override fun runtimeForSdk(sdk: Sdk): Runtime? = when {
        sdk.sdkType is JavaSdkType && JavaSdk.getInstance().getVersion(sdk)
            ?.let { it == JavaSdkVersion.JDK_1_8 || it.maxLanguageLevel.isLessThan(LanguageLevel.JDK_1_8) } == true -> Runtime.JAVA8
        else -> null
    }

    override fun getModuleType(): ModuleType<*> = JavaModuleType.getModuleType()

    override fun getIdeSdkType(): SdkType = JavaSdk.getInstance()

    override fun supportsSamBuild(): Boolean = true
}
