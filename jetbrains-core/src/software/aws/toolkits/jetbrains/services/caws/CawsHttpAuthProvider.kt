// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.project.Project
import com.intellij.util.AuthData
import git4idea.remote.GitHttpAuthDataProvider
import software.aws.toolkits.jetbrains.services.caws.pat.getPat

class CawsHttpAuthProvider : GitHttpAuthDataProvider {
    override fun forgetPassword(project: Project, url: String, authData: AuthData) {
        super.forgetPassword(project, url, authData)
    }

    override fun getAuthData(project: Project, url: String, login: String): AuthData? {
        if (url.contains(CawsEndpoints.CAWS_GIT_PATTERN)) {
            return getPat(login)?.let { AuthData(login, it.getPasswordAsString()) }
        }

        return null
    }
}
