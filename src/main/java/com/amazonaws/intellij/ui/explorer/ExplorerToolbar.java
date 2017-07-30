package com.amazonaws.intellij.ui.explorer;

import com.amazonaws.intellij.core.region.AwsDefaultRegionProvider;
import com.amazonaws.intellij.ui.ui.widgets.AwsRegionPanel;
import com.intellij.ide.util.treeView.NodeDescriptor;
import com.intellij.ide.util.treeView.NodeRenderer;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Disposer;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.ui.components.panels.Wrapper;
import com.intellij.ui.treeStructure.Tree;
import com.intellij.util.ui.UIUtil;
import org.jetbrains.annotations.NonNls;

import javax.annotation.Nonnull;
import javax.swing.*;
import javax.swing.tree.DefaultMutableTreeNode;
import javax.swing.tree.DefaultTreeModel;

/**
 * Created by zhaoxiz on 7/20/17.
 */
public class ExplorerToolbar {
    private final AwsDefaultRegionProvider regionProvider;
    private final Project project;
    private AwsRegionPanel regionPanel;
    private JPanel mainPanel;
    private Wrapper wrapper;

    public ExplorerToolbar(@Nonnull Project project, @NonNls Wrapper wrapper) {
        this.project = project;
        this.regionProvider = AwsDefaultRegionProvider.getInstance(project);
        this.wrapper = wrapper;
        this.regionPanel = new AwsRegionPanel(regionProvider.getCurrentRegion());

        regionPanel.addActionListener(e -> onAwsRegionComboSelected());
        onAwsRegionComboSelected();

        mainPanel.add(regionPanel.getRegionPanel());
    }

    private void onAwsRegionComboSelected() {
        String selectedRegion = regionPanel.getSelectedRegion();

        DefaultTreeModel model = new DefaultTreeModel(new DefaultMutableTreeNode());
        JTree awsTree = createTree();

        AwsExplorerTreeBuilder builder = new AwsExplorerTreeBuilder(awsTree, model, project, selectedRegion);

        Disposer.register(project, builder);
        wrapper.setContent(new JBScrollPane(awsTree));

        regionProvider.setCurrentRegion(selectedRegion);
    }

    public JComponent getMainPanel() {
        return mainPanel;
    }

    private JTree createTree() {
        Tree awsTree = new Tree();
        UIUtil.setLineStyleAngled(awsTree);
        awsTree.setRootVisible(false);
        awsTree.setAutoscrolls(true);
        awsTree.setCellRenderer(new AwsTreeCellRenderer());
        return awsTree;
    }

    private static class AwsTreeCellRenderer extends NodeRenderer {
        @Override
        public void customizeCellRenderer(JTree tree, Object value, boolean selected, boolean expanded, boolean leaf, int row, boolean hasFocus) {
            super.customizeCellRenderer(tree, value, selected, expanded, leaf, row, hasFocus);
            if (value instanceof DefaultMutableTreeNode) {
                DefaultMutableTreeNode treeNode = (DefaultMutableTreeNode) value;
                if (treeNode.getUserObject() instanceof NodeDescriptor<?>) {
                    NodeDescriptor<?> descriptor = (NodeDescriptor<?>) treeNode.getUserObject();
                    setIcon(descriptor.getIcon());
                }
            }
        }
    }
}