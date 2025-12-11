/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import {
    getLabel,
    isLeafNode,
    getIconForNodeType,
    createTreeItem,
    createColumnTreeItem,
    createErrorTreeItem,
    isRedLakeDatabase,
    getTooltip,
    getRedshiftTypeFromHost,
    isRedLakeCatalog,
    isS3TablesCatalog,
} from '../../../../sagemakerunifiedstudio/explorer/nodes/utils'
import { NodeType, ConnectionType, RedshiftType } from '../../../../sagemakerunifiedstudio/explorer/nodes/types'

describe('utils', function () {
    describe('getLabel', function () {
        it('should return container labels for container nodes', function () {
            assert.strictEqual(getLabel({ id: 'test', nodeType: NodeType.REDSHIFT_TABLE, isContainer: true }), 'Tables')
            assert.strictEqual(getLabel({ id: 'test', nodeType: NodeType.REDSHIFT_VIEW, isContainer: true }), 'Views')
            assert.strictEqual(
                getLabel({ id: 'test', nodeType: NodeType.REDSHIFT_FUNCTION, isContainer: true }),
                'Functions'
            )
            assert.strictEqual(
                getLabel({ id: 'test', nodeType: NodeType.REDSHIFT_STORED_PROCEDURE, isContainer: true }),
                'Stored Procedures'
            )
        })

        it('should return path label when available', function () {
            assert.strictEqual(
                getLabel({ id: 'test', nodeType: NodeType.S3_FILE, path: { label: 'custom-label' } }),
                'custom-label'
            )
        })

        it('should return S3 folder name with trailing slash', function () {
            assert.strictEqual(
                getLabel({ id: 'test', nodeType: NodeType.S3_FOLDER, path: { key: 'folder/subfolder/' } }),
                'subfolder/'
            )
        })

        it('should return S3 file name', function () {
            assert.strictEqual(
                getLabel({ id: 'test', nodeType: NodeType.S3_FILE, path: { key: 'folder/file.txt' } }),
                'file.txt'
            )
        })

        it('should return last part of ID as fallback', function () {
            assert.strictEqual(getLabel({ id: 'parent/child/node', nodeType: NodeType.CONNECTION }), 'node')
        })
    })

    describe('isLeafNode', function () {
        it('should return false for container nodes', function () {
            assert.strictEqual(isLeafNode({ nodeType: NodeType.REDSHIFT_TABLE, isContainer: true }), false)
        })

        it('should return true for leaf node types', function () {
            assert.strictEqual(isLeafNode({ nodeType: NodeType.S3_FILE }), true)
            assert.strictEqual(isLeafNode({ nodeType: NodeType.REDSHIFT_COLUMN }), true)
            assert.strictEqual(isLeafNode({ nodeType: NodeType.ERROR }), true)
            assert.strictEqual(isLeafNode({ nodeType: NodeType.LOADING }), true)
            assert.strictEqual(isLeafNode({ nodeType: NodeType.EMPTY }), true)
        })

        it('should return false for non-leaf node types', function () {
            assert.strictEqual(isLeafNode({ nodeType: NodeType.CONNECTION }), false)
            assert.strictEqual(isLeafNode({ nodeType: NodeType.REDSHIFT_CLUSTER }), false)
        })
    })

    describe('getIconForNodeType', function () {
        it('should return correct icons for different node types', function () {
            const errorIcon = getIconForNodeType(NodeType.ERROR)
            const loadingIcon = getIconForNodeType(NodeType.LOADING)

            assert.ok(errorIcon instanceof vscode.ThemeIcon)
            assert.strictEqual((errorIcon as vscode.ThemeIcon).id, 'error')
            assert.ok(loadingIcon instanceof vscode.ThemeIcon)
            assert.strictEqual((loadingIcon as vscode.ThemeIcon).id, 'loading~spin')
        })

        it('should return different icons for container vs non-container nodes', function () {
            const containerIcon = getIconForNodeType(NodeType.REDSHIFT_TABLE, true)
            const nonContainerIcon = getIconForNodeType(NodeType.REDSHIFT_TABLE, false)

            assert.ok(containerIcon instanceof vscode.ThemeIcon)
            assert.ok(nonContainerIcon instanceof vscode.ThemeIcon)
            assert.strictEqual((containerIcon as vscode.ThemeIcon).id, 'table')
            assert.strictEqual((nonContainerIcon as vscode.ThemeIcon).id, 'aws-redshift-table')
        })

        it('should return custom icon for GLUE_CATALOG', function () {
            const catalogIcon = getIconForNodeType(NodeType.GLUE_CATALOG)

            // The catalog icon should be a custom icon, not a ThemeIcon
            assert.ok(catalogIcon)
            // We can't easily test the exact icon path in unit tests, but we can verify it's not a ThemeIcon
            assert.ok(
                !(catalogIcon instanceof vscode.ThemeIcon) ||
                    (catalogIcon as any).id === 'aws-sagemakerunifiedstudio-catalog'
            )
        })
    })

    describe('createTreeItem', function () {
        it('should create tree item with correct properties', function () {
            const item = createTreeItem('Test Label', NodeType.CONNECTION, false, false, 'Test Tooltip')

            assert.strictEqual(item.label, 'Test Label')
            assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(item.contextValue, NodeType.CONNECTION)
            assert.strictEqual(item.tooltip, 'Test Tooltip')
        })

        it('should create leaf node with None collapsible state', function () {
            const item = createTreeItem('Leaf Node', NodeType.S3_FILE, true)

            assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None)
        })
    })

    describe('createColumnTreeItem', function () {
        it('should create column tree item with type description', function () {
            const item = createColumnTreeItem('column_name', 'VARCHAR(255)', NodeType.REDSHIFT_COLUMN)

            assert.strictEqual(item.label, 'column_name')
            assert.strictEqual(item.description, 'VARCHAR(255)')
            assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(item.contextValue, NodeType.REDSHIFT_COLUMN)
            assert.strictEqual(item.tooltip, 'column_name: VARCHAR(255)')
        })
    })

    describe('createErrorTreeItem', function () {
        it('should create error tree item', function () {
            const item = createErrorTreeItem('Error message')

            assert.strictEqual(item.label, 'Error message')
            assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.ok(item.iconPath instanceof vscode.ThemeIcon)
            assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'error')
        })
    })

    describe('isRedLakeDatabase', function () {
        it('should return true for RedLake database names', function () {
            assert.strictEqual(isRedLakeDatabase('database@catalog'), true)
            assert.strictEqual(isRedLakeDatabase('my-db@my-catalog'), true)
            assert.strictEqual(isRedLakeDatabase('test_db@test_catalog'), true)
        })

        it('should return false for regular database names', function () {
            assert.strictEqual(isRedLakeDatabase('regular_database'), false)
            assert.strictEqual(isRedLakeDatabase('dev'), false)
            assert.strictEqual(isRedLakeDatabase(''), false)
            assert.strictEqual(isRedLakeDatabase(undefined), false)
        })
    })

    describe('getTooltip', function () {
        it('should return correct tooltip for connection nodes', function () {
            const redshiftData = {
                id: 'conn1',
                nodeType: NodeType.CONNECTION,
                connectionType: ConnectionType.REDSHIFT,
            }
            const s3Data = {
                id: 'conn2',
                nodeType: NodeType.CONNECTION,
                connectionType: ConnectionType.S3,
            }

            assert.strictEqual(getTooltip(redshiftData), 'Redshift Connection: conn1')
            assert.strictEqual(getTooltip(s3Data), 'Connection: conn2\nType: S3')
        })

        it('should return correct tooltip for S3 nodes', function () {
            const bucketData = {
                id: 'bucket1',
                nodeType: NodeType.S3_BUCKET,
                path: { bucket: 'my-bucket' },
            }
            const fileData = {
                id: 'file1',
                nodeType: NodeType.S3_FILE,
                path: { bucket: 'my-bucket', key: 'folder/file.txt' },
            }

            assert.strictEqual(getTooltip(bucketData), 'S3 Bucket: my-bucket')
            assert.strictEqual(getTooltip(fileData), 'File: file.txt\nBucket: my-bucket')
        })

        it('should return correct tooltip for Redshift container nodes', function () {
            const containerData = {
                id: 'tables',
                nodeType: NodeType.REDSHIFT_TABLE,
                isContainer: true,
                path: { schema: 'public' },
            }

            assert.strictEqual(getTooltip(containerData), 'Tables in public')
        })

        it('should return correct tooltip for Redshift object nodes', function () {
            const tableData = {
                id: 'table1',
                nodeType: NodeType.REDSHIFT_TABLE,
                path: { schema: 'public' },
            }

            assert.strictEqual(getTooltip(tableData), 'Table: public.table1')
        })
    })

    describe('getRedshiftTypeFromHost', function () {
        it('should return undefined for invalid hosts', function () {
            assert.strictEqual(getRedshiftTypeFromHost(undefined), undefined)
            assert.strictEqual(getRedshiftTypeFromHost(''), undefined)
            assert.strictEqual(getRedshiftTypeFromHost('invalid-host'), undefined)
        })

        it('should identify serverless hosts', function () {
            const serverlessHost = 'workgroup.123456789012.us-east-1.redshift-serverless.amazonaws.com'
            assert.strictEqual(getRedshiftTypeFromHost(serverlessHost), RedshiftType.Serverless)
        })

        it('should identify cluster hosts', function () {
            const clusterHost = 'cluster.123456789012.us-east-1.redshift.amazonaws.com'
            assert.strictEqual(getRedshiftTypeFromHost(clusterHost), RedshiftType.Cluster)
        })

        it('should handle hosts with port numbers', function () {
            const hostWithPort = 'cluster.123456789012.us-east-1.redshift.amazonaws.com:5439'
            assert.strictEqual(getRedshiftTypeFromHost(hostWithPort), RedshiftType.Cluster)
        })

        it('should return undefined for unrecognized domains', function () {
            const unknownHost = 'host.example.com'
            assert.strictEqual(getRedshiftTypeFromHost(unknownHost), undefined)
        })
    })

    describe('isRedLakeCatalog', function () {
        it('should return true for RedLake catalogs with FederatedCatalog connection', function () {
            const catalog = {
                FederatedCatalog: {
                    ConnectionName: 'aws:redshift',
                },
            }
            assert.strictEqual(isRedLakeCatalog(catalog), true)
        })

        it('should return true for RedLake catalogs with CatalogProperties', function () {
            const catalog = {
                CatalogProperties: {
                    DataLakeAccessProperties: {
                        CatalogType: 'aws:redshift',
                    },
                },
            }
            assert.strictEqual(isRedLakeCatalog(catalog), true)
        })

        it('should return false for non-RedLake catalogs', function () {
            const catalog = {
                FederatedCatalog: {
                    ConnectionName: 'aws:s3tables',
                },
            }
            assert.strictEqual(isRedLakeCatalog(catalog), false)
        })

        it('should return false for undefined catalog', function () {
            assert.strictEqual(isRedLakeCatalog(undefined), false)
        })
    })

    describe('isS3TablesCatalog', function () {
        it('should return true for S3 Tables catalogs', function () {
            const catalog = {
                FederatedCatalog: {
                    ConnectionName: 'aws:s3tables',
                },
            }
            assert.strictEqual(isS3TablesCatalog(catalog), true)
        })

        it('should return false for non-S3 Tables catalogs', function () {
            const catalog = {
                FederatedCatalog: {
                    ConnectionName: 'aws:redshift',
                },
            }
            assert.strictEqual(isS3TablesCatalog(catalog), false)
        })

        it('should return false for undefined catalog', function () {
            assert.strictEqual(isS3TablesCatalog(undefined), false)
        })
    })
})
