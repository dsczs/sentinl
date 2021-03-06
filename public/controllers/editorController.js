/* global angular */
import _ from 'lodash';
import confirmMessage from '../templates/confirm-message.html';

import { app } from '../app.module';
import WatcherHelper from '../classes/WatcherHelper';

// EDITOR CONTROLLER
app.controller('EditorController', function ($rootScope, $scope, $route, $interval,
  $timeout, timefilter, Private, createNotifier, $window, $uibModal,
  $log, navMenu, globalNavState, $routeParams, sentinlService, dataTransfer, $location) {

  let editorMode = $location.$$path.slice(1); // modes: editor, wizard
  if (_.includes(editorMode, '/')) editorMode = editorMode.split('/')[0];
  const tabName = editorMode.slice(0, 1).toUpperCase() + editorMode.slice(1);

  $scope.topNavMenu = navMenu.getTopNav(editorMode);
  $scope.tabsMenu = navMenu.getTabs(editorMode, [{ name: tabName, url: `#/${editorMode}` }]);
  navMenu.setKbnLogo(globalNavState.isOpen());
  $scope.$on('globalNavState:change', () => navMenu.setKbnLogo(globalNavState.isOpen()));

  const notify = createNotifier({
    location: `Sentinl Watcher ${tabName}`
  });

  // Init editor form
  const initEditor = function () {
    const wHelper = new WatcherHelper();

    $scope.form = {
      saveTimeout: 1000,
      status: !$scope.watcher._source.disable ? 'Enabled' : 'Disable',
      messages: {
        success: null,
        danger: null,
        timeout: 3000
      },
      scripts: {
        transform: {},
        input: {},
        condition: {}
      },
      actions: {
        new: {
          edit: false
        },
        types: [ 'webhook', 'email', 'email_html', 'report', 'slack', 'console' ],
        status: {}
      },
      rawEnabled: false,
      tabs: {
        input: { disable: false },
        condition: { disable: false },
        transform: { disable: false }
      }
    };


    sentinlService.getAuthInfo()
    .then((resp) => {
      $scope.watcher.$$authentication = {
        mode: resp.data.mode,
        enabled: resp.data.enabled
      };
    })
    .catch((error) => notify.error(`Failed to get authentication info: ${error}`));


    $scope.actionOfType = function (action, type) {
      return _.has(action, type);
    };


    $scope.actionsExist = function (actions) {
      return _.keys(actions).length;
    };


    $scope.aceOptions = function (mode, lines = 10) {
      return {
        mode: mode,
        useWrapMode : true,
        showGutter: true,
        rendererOptions: {
          maxLines: lines,
          minLines: 5
        },
        editorOptions: {
          autoScrollEditorIntoView: false
        },
        onLoad: function ($$editor) {
          $$editor.$blockScrolling = Infinity;
        }
      };
    };

    const initActionTitles = function () {
      _.forEach($scope.watcher._source.actions, (settings, name) => { settings.$$title = name; });
    };


    const initSchedule = function () {
      $scope.watcher._source.$$schedule = {
        hours: 0,
        mins: 0,
        secs: 0
      };
      _.forEach($scope.watcher._source.trigger.schedule.later.split(','), (period) => {
        if (period.match(/hour/i)) {
          $scope.watcher._source.$$schedule.hours = +_.trim(period).split(' ')[1];
        }
        if (period.match(/min/i)) {
          $scope.watcher._source.$$schedule.mins = +_.trim(period).split(' ')[1];
        }
        if (period.match(/sec/i)) {
          $scope.watcher._source.$$schedule.secs = +_.trim(period).split(' ')[1];
        }
      });
    };


    const initThrottlePeriods = function () {
      const getHours = function (str) {
        return str.match(/([0-9]?[0-9])h/i) ? +str.match(/([0-9]?[0-9])h/i)[1] : 0;
      };
      const getMins = function (str) {
        return str.match(/([0-9]?[0-9])m/i) ? +str.match(/([0-9]?[0-9])m/i)[1] : 0;
      };
      const getSecs = function (str) {
        return str.match(/([0-9]?[0-9])s/i) ? +str.match(/([0-9]?[0-9])s/i)[1] : 0;
      };

      _.forEach($scope.watcher._source.actions, (action) => {
        if (!action.throttle_period) {
          action.throttle_period = '30s';
        }
        action.$$throttle = {
          hours: getHours(action.throttle_period),
          mins: getMins(action.throttle_period),
          secs: getSecs(action.throttle_period)
        };
      });
    };


    const saveSchedule = function () {
      let schedule = [];
      _.forEach($scope.watcher._source.$$schedule, (value, key) => {
        if (value) {
          schedule.push(`every ${value} ${key}`);
        }
      });
      $scope.watcher._source.trigger.schedule.later = schedule.join(', ');
      delete $scope.watcher._source.$$schedule;
    };


    const saveThrottle = function () {
      _.forEach($scope.watcher._source.actions, (action) => {
        _.forEach(action.$$throttle, (value, key) => {
          if (!value) action.$$throttle[key] = 0;
        });
        action.throttle_period = `${action.$$throttle.hours}h${action.$$throttle.mins}m${action.$$throttle.secs}s`;
        delete action.$$throttle;
      });
    };


    $scope.isEmpty = function (obj) {
      return _.isEmpty(obj);
    };


    $scope.saveScript = function (type) {
      const title = `${type}Title`;

      if ($scope.watcherForm[title].$viewValue && $scope.watcherForm[title].$viewValue.length) {
        $scope.watcherForm[title].$valid = true;
        $scope.watcherForm[title].$invalid = false;
      } else {
        $scope.watcherForm[title].$valid = false;
        $scope.watcherForm[title].$invalid = true;
      }

      if ($scope.watcherForm[title].$valid) {
        const id = Math.random().toString(36).slice(2);
        $scope.form.scripts[type][id] = {
          title: $scope.watcher.$$scripts[type].title,
          body: $scope.watcher.$$scripts[type].body
        };

        sentinlService.saveScript(type, id, $scope.form.scripts[type][id]).then((msg) => {
          if (msg.data.ok) {
            $timeout(() => notify.info('Script successfully saved!'), $scope.form.saveTimeout);
          } else {
            $timeout(() => notify.error('Fail to save the script!'), $scope.form.saveTimeout);
          }
        })
        .catch(notify.error);
      }
    };


    $scope.selectScript = function (type, id) {
      $scope.watcher.$$scripts[type] = {
        id: id,
        title: $scope.form.scripts[type][id].title,
        body: $scope.form.scripts[type][id].body
      };
    };


    $scope.removeScript = function (type) {
      const id = $scope.watcher.$$scripts[type].id;
      sentinlService.deleteScript(type, id).then((msg) => {
        if (msg.data.ok) {
          $timeout(() => notify.info('Script deleted!'), $scope.form.saveTimeout);
        } else {
          $timeout(() => notify.error('Fail to delete the script!'), $scope.form.saveTimeout);
        }
      })
      .catch(notify.error);
      delete $scope.form.scripts[type][id];
    };


    $scope.toggleWatcher = function () {
      if (!$scope.watcher._source.disable) {
        $scope.form.status = 'Enabled';
        $scope.watcher._source.disable = false;
      } else {
        $scope.form.status = 'Disabled';
        $scope.watcher._source.disable = true;
      }
    };


    const removeAction = function (actionName) {
      const confirmModal = $uibModal.open({
        template: confirmMessage,
        controller: 'ConfirmMessageController',
        size: 'sm'
      });

      confirmModal.result.then((response) => {
        if (response === 'yes') {
          delete $scope.watcher._source.actions[actionName];

          if ($scope.watcher._source.report && !wHelper.numOfActionTypes($scope.watcher, 'report')) {
            delete $scope.watcher._source.report;
          }
        }
      }, () => {
        $log.info(`You choose not deleting the action "${actionName}"`);
      });
    };


    const renameActions = function (actions) {
      const newActions = {};
      _.forEach(actions, (settings, name) => {
        newActions[settings.$$title] = settings;
        delete newActions[settings.$$title].$$title;
      });
      return newActions;
    };


    const saveEditorsText = function () {
      _.forEach($scope.watcher.$$scripts, (script, field) => {
        if (script.body && script.body.length) {
          if (field === 'input') {
            $scope.watcher._source[field] = angular.fromJson(script.body);
          } else {
            $scope.watcher._source[field].script.script = script.body;
          }
        }
      });

      _.forEach($scope.watcher._source.actions, (settings, name) => {
        _.forEach($scope.form.actions.types, (type) => {
          if (_.has(settings, type)) {
            delete settings[type].$$edit;
          }

          if (type === 'webhook' && _.has(settings, type)) {
            if (settings[type]._headers && settings[type]._headers.length) {
              settings[type].headers = angular.fromJson(settings[type]._headers);
            } else {
              delete settings[type].headers;
            }
            delete settings[type]._headers;
          }
        });
      });
    };


    const initScripts = function () {
      $scope.watcher.$$scripts = {};

      if (editorMode === 'wizard' && $scope.watcher._source.condition.script.script.length) {
        $scope.watcher._source.$$condition_value = +$scope.watcher._source.condition.script.script.split(' ')[2];
      }

      if (editorMode !== 'wizard') {
        _.forEach($scope.form.scripts, (script, field) => {
          // for migration purposes
          // add some fields if they don't exist in old watcher which was created under Sentinl v4
          if (field !== 'input' && !_.has($scope.watcher._source[field], 'script.script')) {
            $scope.watcher._source[field] = { script: { script: '' } };
          }
          if (!$scope.watcher._source.input) {
            $scope.watcher._source.input = {};
          }

          let value = field === 'input' ? $scope.watcher._source.input : $scope.watcher._source[field].script.script;

          $scope.watcher.$$scripts[field] = {
            id: null,
            title: null,
            body: field === 'input' ? angular.toJson(value, 'pretty') : value
          };

          sentinlService.listScripts(field).then((resp) => {
            _.forEach(resp.data.hits.hits, (script) => {
              $scope.form.scripts[field][script._id] = script._source;
            });
          }).catch(notify.error);
        });
      }
    };


    // Disable tabs (Input, Condition and Transform) if there are only report actions
    const initTabs = function () {
      const actionTypes = {};
      _.forEach($scope.watcher._source.actions, (settings, name) => {
        _.forEach($scope.form.actions.types, (type) => {
          if (settings[type]) actionTypes[type] = true;
        });
      });

      if (_.keys(actionTypes).length === 1 && _.keys(actionTypes)[0] === 'report') {
        _.forEach($scope.form.tabs, (tab) => { tab.disable = true; });
      } else {
        _.forEach($scope.form.tabs, (tab) => { tab.disable = false; });
      }
    };


    const initRaw = function () {
      $scope.watcher.$$raw = angular.toJson($scope.watcher, 'pretty');
    };


    const init = function () {
      if (editorMode !== 'wizard') {
        try {
          initTabs();
        } catch (e) {
          notify.error(`Fail to initialize editor tabs: ${e}`);
        }
      }

      try {
        initScripts();
      } catch (e) {
        notify.error(`Fail to initialize scripts: ${e}`);
      }

      try {
        initRaw();
      } catch (e) {
        notify.error(`Fail to initialize raw settings: ${e}`);
      }

      try {
        initActionTitles();
      } catch (e) {
        notify.error(`Fail to initialize actions: ${e}`);
      }

      try {
        initSchedule();
      } catch (e) {
        notify.error(`Fail to initialize schedule: ${e}`);
      }

      try {
        initThrottlePeriods();
      } catch (e) {
        notify.error(`Fail to initialize throttle periods: ${e}`);
      }
    };


    $scope.saveEditor = function () {
      $scope.watcherForm.$valid = true;
      $scope.watcherForm.$invalid = false;

      if (editorMode === 'wizard' && $scope.watcher._source.condition.script.script.length) {
        const condition = $scope.watcher._source.condition.script.script.split(' ');
        condition[2] = $scope.watcher._source.$$condition_value;
        $scope.watcher._source.condition.script.script = condition.join(' ');
        delete $scope.watcher._source.$$condition_value;
      }

      if ($scope.form.rawEnabled) {
        try {
          // All settings will have been overwritten if enable is checked and the watcher is saved.
          $scope.watcher = angular.fromJson($scope.watcher.$$raw);
        } catch (e) {
          notify.error(`Invalid Raw configuration: ${e}`);
          $scope.watcherForm.$valid = false;
          $scope.watcherForm.$invalid = true;
        }

        if ($scope.watcherForm.$valid) {
          sentinlService.saveWatcher($scope.watcher)
          .then(() => $timeout(() => notify.info('Watcher successfully saved!'), $scope.form.saveTimeout))
          .catch(notify.error);
        }

        return;
      }

      if ($scope.watcherForm.$valid) {
        try {
          saveSchedule();
        } catch (e) {
          notify.error(`Invalid schedule configuration: ${e}`);
          $scope.watcherForm.$valid = false;
          $scope.watcherForm.$invalid = true;
        }

        try {
          saveThrottle();
        } catch (e) {
          notify.error(`Invalid throttle configuration: ${e}`);
          $scope.watcherForm.$valid = false;
          $scope.watcherForm.$invalid = true;
        }

        if (editorMode !== 'wizard') {
          try {
            saveEditorsText();
          } catch (e) {
            notify.error(`Invalid action, Transform or Condition configuration: ${e}`);
            $scope.watcherForm.$valid = false;
            $scope.watcherForm.$invalid = true;
          }
        }

        try {
          $scope.watcher._source.actions = renameActions($scope.watcher._source.actions);
        } catch (e) {
          notify.error(`Fail to rename action: ${e}`);
          $scope.watcherForm.$valid = false;
          $scope.watcherForm.$invalid = true;
        }

      }

      if ($scope.watcherForm.$valid) {
        sentinlService.saveWatcher($scope.watcher)
        .then(() => $timeout(() => notify.info('Watcher successfully saved!'), $scope.form.saveTimeout))
        .catch(notify.error);
      }

      if (editorMode === 'wizard') $scope.cancelEditor();
    };


    $scope.cancelEditor = function () {
      $location.path('/');
    };


    $scope.$on('newAction:added', () => {
      try {
        initTabs();
      } catch (e) {
        notify.error(`Fail to initialize editor tabs: ${e}`);
      }
    });


    const saveAuthenticationPair = function () {
      if ($scope.watcher.$$authentication) {
        if ($scope.watcher.$$authentication.username && $scope.watcher.$$authentication.password) {
          sentinlService.addUser(
            $scope.watcher._id,
            $scope.watcher.$$authentication.username,
            $scope.watcher.$$authentication.password
          ).then((resp) => {
            if (resp.status === 200) {
              console.log('User:${$scope.watcher.$$authentication.username} watcher:${$scope.watcher._id} pair was saved.');
            }
          })
          .catch((error) => notify.error(`Failed to save authentication: ${error}`));
        }
      }
    };


    $scope.$on('action:removeAction', (event, action) => removeAction(action.name));
    $scope.$on('navMenu:cancelEditor', () => $scope.cancelEditor());
    $scope.$on('navMenu:saveEditor', () => {
      $scope.saveEditor();
      saveAuthenticationPair();
      init();
    });


    // fill editor form
    init();
  };


  // Get watcher
  $scope.watcher = {};

  if ($routeParams.watcherId && $routeParams.watcherId.length) { // edit existing watcher
    sentinlService.getWatcher($routeParams.watcherId).then((resp) => {
      if (!_.isObject(resp.data) || _.isEmpty(resp.data)) {
        $timeout(() => notify.error('Fail to get watcher data!'), 1000);
      } else {
        $scope.watcher = resp.data;
        initEditor();
      }
    });
  } else { // forwarded from dashboard spy panel
    $scope.watcher = dataTransfer.getWatcher();
    if (!_.isObject($scope.watcher) || _.isEmpty($scope.watcher)) {
      $timeout(() => notify.error('Fail to get watcher data!'), 1000);
    } else {
      initEditor();
    }
  }

});
