// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/*
 * Copyright 2000-2017 JetBrains s.r.o.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package software.aws.toolkits.jetbrains.ui.tree;

import org.jetbrains.annotations.NotNull;

/**
 * Coped over from JetBrains intellij-community to make the imports and casts align correctly
 */
public interface InvokerSupplier {
  /**
   * @return preferable invoker to be used to access the supplier
   */
  @NotNull
  Invoker getInvoker();
}
