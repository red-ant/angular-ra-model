'use strict';

/* globals $:true */
angular.module('ra.model.services', []).

  run(function($rootScope, raModel) {
    // TODO: add configuration option to disable
    // convenience method polluting $rootScope
    $rootScope.model = function(name, obj) {
      var model  = raModel(this, name, obj);
      this[name] = model;

      return model;
    };
  }).

  factory('raModel', function($rootScope) {

    // Snippet taken from http://prototypejs.org
    function argumentNames(func) {
      var names = func.toString().match(/^[\s\(]*function[^(]*\(([^)]*)\)/)[1]
        .replace(/\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g, '')
        .replace(/\s+/g, '').split(',');

      return names.length === 1 && !names[0] ? [] : names;
    }


    function ModelFactory($scope, name, obj) {
      var keys, original;

      if (angular.isString($scope)) {
        obj    = name;
        name   = $scope;
        $scope = $rootScope;
      }

      function Model(obj) {
        this.is = {};
        return angular.extend(this, obj);
      }


      Model.prototype.init = function(params) {
        this.is.inited = true;
        return get.call(this, params);
      };


      Model.prototype.data = function() {
        var data = {},
            self = this;

        angular.forEach(keys, function(key) {
          if (key in self) {
            data[key] = self[key];
          }
        });

        return data;
      };


      Model.prototype.snapshot = function() {
        original = this.data();
      };


      Model.prototype.reset = function() {
        angular.extend(this, original);
      };


      Model.prototype.update = function() {
        var self    = this;
        var data    = this.data();
        var promise = this.$update.call(data);

        this.is.updating   = true;
        this.is.processing = true;

        promise
          .then(function(response) {
            if (angular.isFunction(self.updateSuccess)) {
              self.updateSuccess(response);
            }

            self.is.updating   = false;
            self.is.processing = false;

            self.snapshot();

            $scope.$broadcast(self.name + ':updateComplete', response);
            $scope.$broadcast(self.name + ':updateSuccess',  response);
          })
          .catch(function(response) {
            if (angular.isFunction(self.updateError)) {
              self.updateError(response);
            }

            self.is.updating   = false;
            self.is.processing = false;

            $scope.$broadcast(self.name + ':updateComplete', response);
            $scope.$broadcast(self.name + ':updateError',    response);
          });

        return promise;
      };


      // TODO: inheritance needs to be tested throroughly
      Model.prototype.extend = function(methods) {
        var self       = this;
        var properties = Object.keys(methods);

        angular.forEach(properties, function(property) {
          var value = methods[property];

          if (angular.isFunction(value)) {
            if (argumentNames(value)[0] === '$super') {
              var method = angular.copy(value);
              var $super = self[property];

              value = (function(m) {
                return function() {
                  var args = Array.prototype.slice.call(arguments, 0);
                  args.push($super.bind(self));

                  method.apply(self, args);
                };
              })(property);

              self[property] = value;
            } else {
              self[property] = value;
            }
          }
        }.bind(this));
      };


      var get = function(passed_params) {
        var call;

        if (this.resource) {
          var args = [],
              params;

          if (this.params) {
            if (angular.isFunction(this.params)) {
              params = this.params();
            } else {
              params = this.params;
            }
          }

          args.push(angular.extend({}, params, passed_params));

          var resource = this.resource,
              context  = this;

          if (this.resource_method) {
            resource = resource[this.resource_method];
            context  = this.resource;
          }

          call = resource.apply(context, args);
          call.$promise.then(success.bind(this), error.bind(this));
        } else if (this.get) {
          call = this.get();
        }

        this.is.loading = true;

        return call;
      };


      var success = function(response) {
        setKeys.call(this, response);

        if (this.resource_set !== false) {
          if (angular.isArray(response)) {
            var resource_attribute   = this.resource_attribute || 'items';
            this[resource_attribute] = response;
          } else {
            // At the moment angular.extend does not pull in prototype methods
            // when doing an extend. Need to look into a nicer way of doing
            // this and hopefully removing jQuery as a dependency
            $.extend(this, response);
          }
        }

        this.is.loaded  = true;
        this.is.loading = false;

        if (angular.isFunction(this.success)) {
          this.success(response);
        }

        this.snapshot();

        $scope.$broadcast(name + ':success',  response);
        $scope.$broadcast(name + ':complete', response);
      };


      var error = function(response) {
        this.is.loaded  = true;
        this.is.loading = false;

        if (angular.isFunction(this.error)) {
          this.error(response);
        }

        $scope.$broadcast(name + ':error',    response);
        $scope.$broadcast(name + ':complete', response);
      };


      var setKeys = function(response) {
        var obj;

        if (angular.isArray(response) && response.length > 1) {
          obj = response[0];
        } else {
          obj = response;
        }

        if (angular.isObject(obj)) {
          var _keys = [];

          // TODO: might have to refactor this for backwards compatibility
          angular.forEach(Object.keys(obj), function(key) {
            if (key.charAt(0) !== '$' && key.charAt(0) !== '_') {
              _keys.push(key);
            }
          });

          keys = _keys;
        }
      };

      return new Model(obj);
    }

    return ModelFactory;
  });
