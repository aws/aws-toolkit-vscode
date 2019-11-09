// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package protocol.model.daemon

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.sink
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rider.model.nova.ide.SolutionModel

@Suppress("unused")
object LambdaDaemonModel : Ext(SolutionModel.Solution) {

    private val LambdaRequest = structdef {
        field("methodName", string)
        field("handler", string)
    }

    init {
        sink("runLambda", LambdaRequest)
            .doc("Signal from backend to run lambda on local environment")

        sink("debugLambda", LambdaRequest)
            .doc("Signal from backend to debug lambda on local environemnt")

        sink("createNewLambda", LambdaRequest)
            .doc("Signal from backend to create a new AWS Lambda")
    }
}
