// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package protocol.model.project

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.call
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rider.model.nova.ide.SolutionModel

@Suppress("unused")
object AwsProjectModel : Ext(SolutionModel.Solution) {

    private val AwsProjectOutputRequest = structdef {
        field("projectPath", string)
    }

    private val AwsProjectOutput = structdef {
        field("assemblyName", string)
        field("location", string)
    }

    init {
        call("getProjectOutput", AwsProjectOutputRequest, AwsProjectOutput)
            .doc("Get AWS project output information")
    }
}
