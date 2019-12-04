// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package protocol.model.setting

import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.setting
import com.jetbrains.rd.generator.nova.source
import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.PredefinedType.bool
import com.jetbrains.rider.model.nova.ide.SolutionModel

@Suppress("unused")
object AwsSettingModel : Ext(SolutionModel.Solution) {

    init {
        source("showLambdaGutterMarks", bool)
            .doc("Flag indicating whether Lambda gutter marks should be shown in editor")
    }
}
