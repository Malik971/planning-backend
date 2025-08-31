'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      uid: {
        type: Sequelize.STRING
      },
      email: {
        type: Sequelize.STRING
      },
      display_name: {
        type: Sequelize.STRING
      },
  role: {
    type: Sequelize.ENUM('admin', 'manager', 'staff'),
    defaultValue: 'staff'
  },
  teams: {
    type: Sequelize.JSON,
    defaultValue: []
  },
      active: {
        type: Sequelize.BOOLEAN
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Users');
  }
};