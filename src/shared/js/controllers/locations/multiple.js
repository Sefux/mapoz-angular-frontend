'use strict';

var async = require('async');
var EXIF = require('exif-js');

var LocationsCreateMultipleController = function ($scope, $routeParams, apiService, authService, $q, $location, mapService,
                                          responseHandler, locationFormDefaults, regionService, GeolocationService,
                                          $mdDialog, $translate, CameraService, PubSub) {
    var lockUpdate;
    $scope.location = {};
    $scope.assets = {
        file: null
    };
    $scope.marker = {
        lat: null,
        lng: null
    };
    $scope.selectedIndex = 0;
    $scope._sys = locationFormDefaults;


    /*
        Update the map to a new geolocation
        Also retrieves the new address
    */
    $scope.updateLocation = function (latlon) {
        $scope.marker = latlon;

        mapService.reverseGeoCode(latlon.lat,latlon.lng,function(err, result){
            if (err) {
                throw err;
            }
            lockUpdate = true;
            if (!result.error) {
                console.log('updateLocation',result.data);

                var address = mapService.createAddressFromGeo(result.data.address);
                if (address) {
                    $scope.location.street = address.street;
                    $scope.location.city = address.city;
                    $scope.location.postcode = address.postcode;
                    $scope.location.country = address.country;
                }
            }
        });
        $scope.showLatLng = false;
    };

    $scope.$watch('files', function(files) {
        if(files.length > 0) {
            var file = files[files.length-1];
            EXIF.getData(file, function() {
              var GPSLat = EXIF.getTag(this,"GPSLatitude");
              var GPSLong = EXIF.getTag(this,"GPSLongitude");
              if(GPSLat && GPSLat.length > 0 && GPSLong && GPSLong.length > 0 ) {
                  var lat = GPSLat[0] + (GPSLat[1]/60) + (GPSLat[2]/3600);
                  var long = GPSLong[0] + (GPSLong[1]/60) + (GPSLong[2]/3600);
                  console.log('latlng',{lat: lat, lng: long});
                  $scope.updateLocation({lat: lat, lng: long});
                  PubSub.publish('alert',{type: 'success', message: $translate.instant('photos.gpsfromphoto')});
              }
            });
         }
    });


    $scope.deletePhoto = function (photo) {
        var confirm = $mdDialog.confirm()
            .title($translate.instant('photos.remove_confirm_title'))
            .textContent($translate.instant('photos.remove_confirm_body'))
            .ariaLabel('photos.remove_confirm_title')
            .ok($translate.instant('actions.ok'))
            .cancel($translate.instant('actions.cancel'));
        $mdDialog.show(confirm).then(function () {
            var deferred = $q.defer();
            $scope.promise = deferred.promise;
            apiService('photos').actions.remove(photo.uuid, function (err) {
                var msgs = {
                    success: 'photos.remove_success',
                    data:  photo.filename
                };
                if (responseHandler.handleResponse(err, deferred, msgs)) {
                    $scope.photos.splice($scope.photos.indexOf(photo),1);
                }
            });
        });
    };


    $scope.files = [];


    $scope.abort = function () {
        $location.path('/' + ($scope.location.region_slug || $scope.location.region_uuid) + '/' +
            $scope.location.slug);
    };

    $scope.promiseShow = function () {
        var deferred = $q.defer();
        $scope.promise = deferred.promise;
    };

    $scope.promiseHide = function () {
        // var deferred = $q.defer();
        $scope.promise.resolve();
    };

    /*
        Submit the new location
     */
    $scope.submit = function () {
        var deferred = $q.defer();
        $scope.promise = deferred.promise;
        //payload.lonlat = [$scope.marker.lng, $scope.marker.lat];
        var isUpdate = false;
        async.forEachLimit($scope.files, 1, function(file, userCallback){
          var payload = file.location || {};
          //console.log('file',file);
          async.waterfall([
              function (cb) {
                  /*
                      Fetch the nearest region
                   */
                  // TODO: this must be limited through region admins!
                  apiService('regions?lat=' + $scope.marker.lat + '&lon=' + $scope.marker.lng).actions.all(cb);
              },
              function (region, cb) {
                  region = region.results || region;
                  if (region && region.length > 0) {
                      if (!payload.hasOwnProperty('region_uuid')) {
                          payload.region_uuid = region[0].uuid;
                      }
                      /*
                          Are we updating or creating?
                       */
                       //console.log('payload',payload);
                      if (payload.uuid) {
                          isUpdate = true;
                          apiService('locations').actions.update(payload.uuid, payload, cb);
                      } else {
                          apiService('locations').actions.create(payload, cb);
                      }
                  } else {
                      cb(new Error('errors.regions.fetch_failed'),null);
                  }
              },
              function (location, cb) {
                //console.log('location',location);
                  if (!isUpdate) {
                      $scope.location.uuid = location.uuid;
                  }
                  $scope.location.slug = location.slug;
                  /*
                      Upload the associated photos
                   */
                  if (file) {
                          apiService('photos').actions.upload({
                              file: file,
                              fields: {location_uuid: location.uuid}
                          }, cb);
                  } else {
                      cb();
                  }
              }
          ], function (err) {
              //console.log('update/insert error',err);
              //console.log('update/insert error status',status);
              var msgs = {
                  success: $routeParams.uuid ? 'messages.locations.update_success' : 'messages.locations.create_success'
              };
              if (responseHandler.handleResponse(err, deferred, msgs)) {
                  userCallback();
                  //apiService('locations').clearCache(payload.uuid, function() {});
                  apiService('/galerie').clearCache('me',function() {});
                  $location.path('/galerie/me' );
              }
          });
        }, function(){
          //console.log("Location Loop Completed", err);
        });
    };


    /*
        Load an existing location to update
     */
    $scope.form_title = '';
    if ($routeParams.uuid) {
        var deferred = $q.defer();
        $scope.promise = deferred.promise;
        async.waterfall([
            function (cb) {
                apiService('locations').actions.find($routeParams.uuid, cb);
            },
            function (location, cb) {
                if (!location.hasOwnProperty('hidden')) {
                    location.hidden = false;
                }
                $scope.location = location;
                $scope.marker = {
                    lng: location.lonlat[0],
                    lat: location.lonlat[1]
                };
                $scope.formTitle = 'Edit "' + location.title + '"';
                apiService('locations/' + location.uuid + '/photos').actions.all(cb);
            },
            function (photos, cb) {
                $scope.photos =  photos.results || photos;
                cb();
            },
            function (cb) {
                regionService.setCurrentRegion($scope.location.region_uuid, cb);
            },
            function (cb) {
                $scope.currentRegion = regionService.currentRegion.title;
                $scope.isAdmin = authService.hasScopes(['admin', 'region-' + $scope.location.region_uuid]);
                $scope.form_title = $translate.instant('locations.update_location');
                if (
                    ($scope.userSession && $scope.location.user_uuid === $scope.userSession.uuid) ||
                    $scope.api_key && ($scope.api_key.scopes.indexOf('region-' + $scope.location.region_uuid) > -1 ||
                    $scope.api_key.scopes.indexOf('admin') > -1)
                ) {
                    $scope.mayEdit = true;
                    $scope.edit = function (uuid) {
                        $location.path('/admin/comments/' + uuid);
                    };
                }
                cb();
            }
        ], function (err) {
            responseHandler.handleResponse(err, deferred);
        });
    } else {
        $scope.form_title = $translate.instant('locations.create_new');
        //create a new location: ask user to use his geoloaction
        GeolocationService.getCurrentPosition().then(
            function (position) { //
                //console.log('Position', position);
                $scope.marker.lat = position.coords.latitude;
                $scope.marker.lng = position.coords.longitude;
                $scope.updateLocation({'lat': position.coords.latitude, 'lng': position.coords.longitude});
            },
            function (errorCode) {
                if (errorCode === false) {
                    PubSub.publish('alert',{type: 'error', message: 'GeoLocation is not supported by browser.'});
                }
                /*
                else if (errorCode === 1) {
                    //TODO: change for https
                    //PubSub.publish('alert',{type: 'error', message: 'User either denied GeoLocation or waited for long to respond.'});

                }
                */
            }
        );
    }

};

LocationsCreateMultipleController.$inject = ['$scope', '$routeParams', 'apiService', 'authService', '$q', '$location',
    'mapService', 'responseHandler', 'locationFormDefaults', 'regionService','GeolocationService', '$mdDialog',
    '$translate', 'CameraService', 'PubSub'];

module.exports = LocationsCreateMultipleController;