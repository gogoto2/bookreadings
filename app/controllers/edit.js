angular.module("bookreadings")
    .constant("tagsURL", "/tagsURL")
    .constant("S3ReadingsPath", "https://s3-us-west-2.amazonaws.com/bookreadings/")
    .constant("CDNReadingsPathCF", "https://d3e04w4j2r2rn6.cloudfront.net/")
    .constant("CDNReadingsPathFP", "https://d1onveq9178bu8.cloudfront.net")
    .controller("editCtrl", function ($scope, $firebase, $firebaseSimpleLogin, $http, $location, $routeParams, ENV, tagsURL, readingsURL, S3ReadingsPath, string_manipulation, CDNReadingsPathCF, CDNReadingsPathFP, tagsByPopularityURL) {

      filepicker.setKey("AnUQHeKNRfmAfXkR3vaRpz");

    	//check if user is authorized -- otherwise forward to home page
        $scope.reading_id = $routeParams.id;
        $scope.reading_deleted = false;
        $scope.CDNReadingsPathFP = CDNReadingsPathFP;

        var readingFirebase = new Firebase(ENV.firebase + readingsURL + "/" + $scope.reading_id);
        $scope.readingRef = $firebase(readingFirebase);

        var readingRecord = $scope.readingRef.$asObject();
        readingRecord.$loaded().then(function() {

            if(readingRecord.deleted == true || !$scope.userIsAdminOrReadingIsCreatedByLoggedInUser(readingRecord.created_by_id)) {

                $location.path("/");

            } else {

              $scope.reading = readingRecord
              $scope.old_tags = [];
              if(readingRecord.tags) {
                for(var i = 0; i < readingRecord.tags.length; i++) {
                  $scope.old_tags.push(readingRecord.tags[i]);
                }
              }

              $scope.updateReading = {};
              $scope.updateReading.title = $scope.reading.title;
              $scope.updateReading.description = $scope.reading.description;
              $scope.updateReading.tags = $scope.reading.tags;
              $scope.updateReading.reading_cover_photo = $scope.reading.cover_image_url;
              $scope.updateReading.purchaseLink = $scope.reading.purchaseLink;
              $scope.updateReading.cover_image_url = $scope.reading.cover_image_url;
              $scope.updateReading.cover_image_filename = $scope.reading.cover_image_filename;
              $scope.updateReading.cover_image_mimetype = $scope.reading.cover_image_mimetype;
              $scope.updateReading.cover_image_size = $scope.reading.cover_image_size;
              $scope.updateReading.cover_image_key = $scope.reading.cover_image_key;
              if(!$scope.reading.align) {

                 $scope.updateReading.align = "center";

              } else {

                $scope.updateReading.align = $scope.reading.align;
              }

            }

        });

        $scope.toggleAlignment = function(alignment) {

          $scope.updateReading.align = alignment;

        }

        $scope.cancelEdit = function(){
        	window.history.back();
        }

        function getFirebaseTagNameReference(tagsURL, tag_name) {

          var tagFirebase = new Firebase(tagsURL + "/" + tag_name);
          return $firebase(tagFirebase);

        }

        function getFirebaseTagReadingReference(tagsURL, tag_name, reading_id) {

          var tagFirebase = new Firebase(tagsURL + "/" + tag_name + "/readings/" + reading_id);
          return $firebase(tagFirebase);

        }

        function getFirebaseReadingTagLocation(readingsURL,reading_id, tag_name) {

          var readingTagLocation = new Firebase(readingsURL + "/" + reading_id + "/tag_locations/" + tag_name);
          return $firebase(readingTagLocation)

        }

        $scope.updateReadingInformation = function(updateReading, readingRef) {

          $scope.disableSaveButton = true;

          var tags = updateReading.tags;
          var tag_array = [];
          for(var i = 0; i < tags.length; i++) {
            var tag_text = tags[i].text.replace('.', '').replace('#', '').replace('$', '').replace('[', '').replace(']', '');
            tag_array.push(tag_text);
          }

          //remove non-unique names
          var uniqueNames = [];
          $.each(tag_array, function(i, el){
              if($.inArray(el, uniqueNames) === -1) uniqueNames.push(el);
          });

          tag_array = uniqueNames;


          var slug = string_manipulation.slugify(updateReading.title);
          var modified = Firebase.ServerValue.TIMESTAMP;

          var update_dictionary = {

            "cover_image_url": updateReading.cover_image_url,
            "cover_image_filename" : updateReading.cover_image_filename,
            "cover_image_mimetype" : updateReading.cover_image_mimetype,
            "cover_image_size" : updateReading.cover_image_size,
            "cover_image_key" : updateReading.cover_image_key,
            "title"  : updateReading.title,
            "modified" : modified,
            "tags" : tag_array,
            "slug" : slug,
            "align" : updateReading.align
          }

          if(updateReading.description) {
            update_dictionary["description"] = updateReading.description;
          }

          if(updateReading.purchaseLink) {
            update_dictionary["purchaseLink"] = updateReading.purchaseLink;
          }

          this.slug = slug;

          readingRef.$update(update_dictionary).then(function(ref){

              var reading_object = readingRef.$asObject();

              var user = $scope.loginObj.user;

              //deal with updating tags
              //step through old tags
              //if it exists now, do nothing
              //if it has been removed, delete it from tags
              //if it has been added, add it to tags
              //update tag locations
              var old_tags = $scope.old_tags;
              var new_tags = tag_array;
              var processed_old_tags = [];
              for(var i = 0; i < old_tags.length; i++) {

                var tag = old_tags[i];

                //if not in array delete
                if($.inArray(tag,new_tags) == -1) {

                  if(reading_object.tag_locations) {

                    //remove from tags
                    var tagReadingRef = getFirebaseTagReadingReference(ENV.firebase + tagsURL, tag, reading_object.tag_locations[tag]);
                    tagReadingRef.$remove();

                    //remove from reading object tag locations
                    getFirebaseReadingTagLocation(ENV.firebase + readingsURL, reading_object.$id, old_tags[i]).$remove();

                    //decrement count on tag object
                    decrement_tag_count(tagsURL, tag, tagsByPopularityURL, old_tags, processed_old_tags, new_tags, reading_object, user);

                  } else {

                    determine_if_new_tags_can_be_processed(tag, processed_old_tags, old_tags, tagsURL, new_tags, reading_object, user);

                  }

                } else {

                  determine_if_new_tags_can_be_processed(tag, processed_old_tags, old_tags, tagsURL, new_tags, reading_object, user);


                }

              }

            });

        }

        function determine_if_new_tags_can_be_processed(tag_name, processed_old_tags, old_tags, tagsURL, new_tags, reading_object, user) {

            processed_old_tags.push(tag_name);
            if(processed_old_tags.length == old_tags.length) {

                process_new_tags(tagsURL, new_tags, reading_object, user, old_tags);

            }

        }

        function decrement_tag_count(tagsURL, tag_name, tagsByPopularityURL, old_tags, processed_old_tags, new_tags, reading_object, user) {

            //increment the tag count
            var tagCount = $scope.getFirebaseTagCountReference(ENV.firebase + tagsURL, tag_name);
            tagCount.$transaction(function(currentCount) {

              if (!currentCount) return 1;   // Initial value for counter.
              if (currentCount < 0) return;  // Return undefined to abort transaction.
              return currentCount - 1;       // Decrement the current counter by 1

            }).then(function(){

                //grab tag popularity id and decrement count and priority on tag popularity object
                decrement_tag_popularity(tagsURL, tag_name, tagsByPopularityURL, old_tags, processed_old_tags, new_tags, reading_object, user);

            });
        }

        function decrement_tag_popularity(tagsURL, tag_name, tagsByPopularityURL, old_tags, processed_old_tags, new_tags, reading_object, user) {

              //see if tags by popularity exists
              var _tags_by_popularity_location_object = $scope.getFirebaseTagsByPopularityReference(ENV.firebase + tagsURL, tag_name).$asObject();
              _tags_by_popularity_location_object.$loaded(function(){

                var tags_by_popularity_location = _tags_by_popularity_location_object.$value;

                if(tags_by_popularity_location != null) {

                  //if it does, go to the object and increment the count and the priority
                  var tagsByPopularityObject = $scope.getFirebaseTagsByPopularityObjectReference(ENV.firebase + tagsByPopularityURL, tags_by_popularity_location).$asObject();
                  tagsByPopularityObject.$loaded(function(){

                    var new_count = tagsByPopularityObject["count"] - 1;
                    tagsByPopularityObject["count"] = new_count;
                    tagsByPopularityObject["$priority"] = -new_count;
                    tagsByPopularityObject.$save().then(function(){

                      determine_if_new_tags_can_be_processed(tag_name, processed_old_tags, old_tags, tagsURL, new_tags, reading_object, user);

                    });

                  });


                }

              });
        }

        function process_new_tags(tagsURL, new_tags, reading_object, user, old_tags){

              //if no new tags just go directly to page
              if(new_tags.length == 0) {
                
                var path = "reading/" + ref.name() + "/" + slug;
                $location.path(path);

              }

              //now deal with adding the new tags
              var processed_tags = [];
              for(var i = 0; i < new_tags.length; i++) {

                var tag = new_tags[i];

                if($.inArray(tag, old_tags) == -1) {

                  //add from reading object / tags
                    var tagsRef = $scope.getFirebaseTagNameListReference(ENV.firebase + tagsURL, tag);
                    $scope.add_tags_to_tag_specific_section(tagsRef, reading_object.$id, user.uid, -reading_object.$priority, new_tags.length, tag, reading_object.slug, processed_tags);

                } else {

                  processed_tags.push(new_tags[i]);

                }

                if(processed_tags.length == new_tags.length) {

                  var path = "reading/" + reading_object.$id + "/" + reading_object.slug;
                  $location.path(path);

                }

              }

        }

        $scope.upload_cover_image = function(updateReading){

          filepicker.pickAndStore(
            {
              extensions: ['.jpg, .png, .jpeg'],
            },
                {
                  location:"S3",
                  path: 'cover_images/',
                },
                function(InkBlobs){

                  var reading = updateReading

                  for(var i = 0; i < InkBlobs.length; i++) {

                    reading["cover_image_url"] = InkBlobs[i].url.replace("https://www.filepicker.io", "");
                    reading["cover_image_filename"] = InkBlobs[i].filename;
                    reading["cover_image_mimetype"] = InkBlobs[i].mimetype;
                    reading["cover_image_size"] = InkBlobs[i].size;
                    reading["cover_image_key"] = InkBlobs[i].key;

                    //var uploaded_file_ref = readingsRef.push();
                    //uploaded_file_ref.set(reading);
                    $scope.$apply(function(){

                      $scope.updateReading = reading
                      updateReading.reading_cover_photo = reading.cover_image_url;
                    });

                  }

          });
      }

 });

