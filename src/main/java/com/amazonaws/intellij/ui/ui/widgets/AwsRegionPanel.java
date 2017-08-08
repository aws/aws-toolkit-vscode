package com.amazonaws.intellij.ui.ui.widgets;

import com.amazonaws.intellij.core.region.AwsRegion;
import com.amazonaws.intellij.core.region.AwsRegionManager;
import com.intellij.openapi.ui.ComboBox;
import com.intellij.ui.CollectionComboBoxModel;

import javax.swing.*;
import java.awt.*;
import java.awt.event.ActionListener;
import java.util.Optional;

/**
 * Created by zhaoxiz on 7/28/17.
 */
public class AwsRegionPanel {
    private JPanel regionPanel;
    private ComboBox<AwsRegion> regionCombo;
    private final CollectionComboBoxModel<AwsRegion> regionModel = new CollectionComboBoxModel<>();

    public AwsRegionPanel(String defaultRegion) {
        regionCombo.setRenderer(new DefaultListCellRenderer() {
            @Override
            public Component getListCellRendererComponent(JList list, Object value, int index, boolean isSelected, boolean cellHasFocus) {
                JLabel label = (JLabel) super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus);
                label.setIcon(((AwsRegion) value).getIcon());
                return label;
            }
        });

        regionCombo.setModel(regionModel);

        AwsRegionManager.INSTANCE.getRegions().forEach(regionModel::add);
        selectRegion(defaultRegion);
    }

    public void addActionListener(ActionListener actionListener) {
        regionCombo.addActionListener(actionListener);
    }

    public JPanel getRegionPanel() {
        return regionPanel;
    }

    private void selectRegion(String regionId) {
        AwsRegionManager.INSTANCE.getRegions().stream().filter((region) -> region.getId().equals(regionId))
                .findFirst().ifPresent(regionModel::setSelectedItem);
    }

    public String getSelectedRegion() {
        assert regionModel.getSelected() != null;
        return regionModel.getSelected().getId();
    }
}