// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.application.ApplicationInfo
import org.testng.SkipException

// This can be removed when we finally fix the Rider tests on 2019.3
fun assume20192Version() {
    if (ApplicationInfo.getInstance().let { info -> info.majorVersion == "2019" && info.minorVersionMainPart == "2" }) {
        return
    }
    throw SkipException("Skip failing Rider test on non-2019.2")
}
