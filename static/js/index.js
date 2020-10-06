// This will be the object that will contain the Vue attributes
// and be used to initialize it.
let app = {};

// Given an empty app object, initializes it filling its attributes,
// creates a Vue instance, and then initializes the Vue instance.
let init = (app) => {

    // This is the Vue data.
    app.data = {
        user_email: user_email,
        notes: [],
    };

    app.index = (a) => {
        // Adds to the notess all the fields on which the UI relies.
        let i = 0;
        for (let n of a) {
            n._idx = i++;
            n.editable = true;
            n.edit = false;
            n.is_pending = false;
            n.error = false;
            n.pending_delete = false;
            n.original_content = n.content; // Content before an edit.
            n.server_content = n.content; // Content on the server.
            n.original_title = n.title; // Content before an edit.
            n.server_title = n.title; // Content on the server.
        }
        return a;
    };

    app.reindex = () => {
        // reindexes notes
        let i = 0;
        for (let n of app.vue.notes) {
            n._idx = i++;
        }
    };

    app.do_edit = (note_idx) => {
        for (let n of app.vue.notes) {
            if (n.edit === true) {
                //DEBUG console.log('Something is already editing');
                return;
            }
        }
        let n = app.vue.notes[note_idx];
        n.edit = true;
        n.is_pending = false;
    };

    app.do_cancel = (note_idx) => {
        // Handler for button that cancels the edit.
        let n = app.vue.notes[note_idx];
        if (n.id === null) {
            // If the post has not been saved yet, we delete it.
            app.vue.notes.splice(note_idx, 1);
            app.reindex();
        } else {
            // We go back to before the edit.
            n.edit = false;
            n.is_pending = false;
            n.content = n.original_content;
            n.title = n.original_title;
        }
    };

    app.do_save = (note_idx) => {
        // Handler for "Save edit" button.
        let n = app.vue.notes[note_idx];
        if (n.content !== n.server_content || n.title !== n.server_title) {
            n.is_pending = true;
            axios.post(notes_url, {
                id: n.id,
                title: n.title,
                starred: n.starred,
                color: n.color,
                content: n.content,
                image: n.image,
            }).then((result) => {
                //DEBUG console.log("Received:", result.data);
                // TODO: You are receiving the post id (in case it was inserted),
                // and the title, starred, color, and content.  You need to set them,
                // and to say that the editing has terminated.
                n.id = result.data.id;
                n.title = result.data.title;
                n.starred = result.data.starred;
                n.color = result.data.color;
                n.content = result.data.content;
                n.image = result.data.image;
                n.last_modified = result.data.last_modified;
                n.server_content = result.data.content;
                n.original_content = result.data.content;
                n.server_title = result.data.title;
                n.original_title = result.data.title;
                n.is_pending = false;
                n.edit = false;

                //
                app.reorder_note(n._idx);
                app.reindex();
                //

            }).catch(() => {
                n.is_pending = false;
                //DEBUG console.log("Caught error");
                // We stay in edit mode.
            });
        } else {
            // No need to save.
            n.edit = false;
            n.original_content = n.content;
        }
    };

    // Puts a note at the top of it's catagory (starred or non)
    // Call reindex after everytime this method is called
    app.reorder_note = (note_idx, non_star_idx = null) => {
        if (app.vue.notes.length <= 1){
            return;
        }
        let org_idx = note_idx;
        let n = app.vue.notes[note_idx];
        if (n.starred === true){
            app.vue.notes.splice(0,0,n);
            app.vue.notes.splice((org_idx + 1),1);
        } else {

            if (non_star_idx === null) {
                //  set default of 0 in case there are no
                //  currently starred nodes
                let non_star_idx = 0;
                for (let x of app.vue.notes) {
                    //DEBUG console.log(x.starred);
                    if (x.starred === false) {
                        non_star_idx = x._idx;
                        break;
                    }
                }
                app.vue.notes.splice(org_idx, 1);
                app.vue.notes.splice(non_star_idx, 0, n);
            } else {
                app.vue.notes.splice(org_idx, 1);
                app.vue.notes.splice(non_star_idx, 0, n);
            }

        }
    };

    app.add_note = () => {
        //prevents more than one note from being added at a time
        for (let n of app.vue.notes) {
            if (n.edit === true) {
                return;
            }
        }
        // This is the new note we are inserting.
        let q = {
            id: null,
            edit: null,
            editable: null,
            server_content: null,
            original_content: "",
            pending_delete: false,

            email: user_email,
            title: "",
            content: "",
            image: '',
            starred: false,
            color: 0,
            last_modified: null,

        };

        app.vue.notes.push(q);
        app.reindex();
        app.do_edit(app.vue.notes.length - 1)
    };

    app.do_delete = (note_idx) => {
        let n = app.vue.notes[note_idx];
        if (n.id === null) {
            // If the post has never been added to the server,
            // simply deletes it from the list of posts.
            app.vue.notes.splice(note_idx, 1);
            app.reindex();
        } else {
            // If the note contains an image, this deletes it from the file
            // system before deleting the note entirely. Prevents unused images
            // from clogging the filesystem
            if (n.image !== null) {
                app.remove_image(note_idx);
            }
            
            // Deletes note on the server and the list of posts.
            axios.post(delete_url, {
                id: n.id,
            }).then((result) => {
                //DEBUG console.log("Deleted Response:", result.data);
            });
            app.vue.notes.splice(note_idx, 1);
            app.reindex();
        }
    };

    app.toggle_delete = (note_idx) => {
        let n = app.vue.notes[note_idx];
        if (n.pending_delete === false) {
            n.pending_delete = true;
        } else {
            n.pending_delete = false;
        }
    };

    app.toggle_starred = (note_idx) => {
        let n = app.vue.notes[note_idx];
        //
        let x = app.get_non_star_idx();

        if (n.starred === false) {
            n.starred = true;
        } else {
            n.starred = false;
        }
        
        // We break if id===null. This means the note is new and hasn't been saved
        // so we can't update in the DB yet. It will get saved in do_save if the
        // user opts to save the new post.
        if (n.id === null) { return; }
        
        axios.post(set_starred_url, {
            id: n.id,
            starred: n.starred,
        }).then((result) => {
            //DEBUG console.log("Deleted Response:", result.data);
            n.last_modified = result.data.last_modified;

            //
            app.reorder_note(n._idx, x);
            app.reindex();
            //

        });
    };

    app.get_non_star_idx = () => {
        for (let n of app.vue.notes) {
            if (n.starred === false) {
                return n._idx;
                break;
            }
        }
    };

    app.style_helper = (colorNum) => {
        if (colorNum === 0) {
            return "has-background-indianred";
        } else if(colorNum === 1) {
            return "has-background-yeller";
        } else if(colorNum === 2) {
            return "has-background-lightgreen";
        } else if (colorNum === 3) {
            return "has-background-lightskyblue";
        } else if (colorNum === 4){
            return "has-background-mediumpurp";
        }
            return;
    };
    
    app.transparent_helper = (colorNum) => {
      if (colorNum === 0) {
            return "background-color: indianred;";
        } else if(colorNum === 1) {
            return "background-color: yellow;";
        } else if(colorNum === 2) {
            return "background-color: lightgreen;";
        } else if (colorNum === 3) {
            return "background-color: lightskyblue;";
        } else if (colorNum === 4){
            return "background-color: mediumpurple;";
        }
            return;
    };

    app.color_change = (note_idx, colorNum) => {
        let n = app.vue.notes[note_idx];
        n.color = colorNum;

        // We break if id===null. This means the note is new and hasn't been saved
        // so we can't update in the DB yet. It will get saved in do_save if the
        // user opts to save the new post.
        if (n.id === null) { return; }
        
        axios.post(set_color_url, {
            id: n.id,
            color: n.color,
        }).then((result) => {
            //DEBUG console.log("Deleted Response:", result.data);
        });


        return;
    };

    app.img_upload = (note_idx, event) => {
        let img = event.target.files[0];
        //DEBUG console.log(img);
        if (img) {
            //send id and file to the controller to be added to the note
            //on the db and for the image to be added to the filesystem
            let n = app.vue.notes[note_idx];
            
            // We break if id===null. This means the note is new and hasn't been saved
            // so we can't update in the DB yet. It will get saved in do_save if the
            // user opts to save the new post.
            if (n.id === null) { return; }
            
            
            let formData = new FormData();
            formData.append('image', img);
            formData.append('id', n.id);
            //DEBUG console.log(formData);
            axios.post(image_url, formData,
                {headers: {'Content-Type': 'multipart/form-data'}})
                .then((result) => {
                    //DEBUG console.log("Image Response:", result.data);
                    //save the returned filepath to note.image
                    n.image = result.data.filepath;
                    n.last_modified = result.data.last_modified;
                    app.reorder_note(n._idx);
                    app.reindex();

                })
                .catch(() => {
                    //DEBUG console.log("Failed to upload image");
                });
        }
    };
    
    app.remove_image = (note_idx) => {
        let n = app.vue.notes[note_idx];
        axios.post(remove_image_url, {
            id: n.id,
            image: n.image,
        }).then((result) => {
            //DEBUG console.log("Image Removed");
            n.image=null;
        });
    };
    
    // We form the dictionary of all methods, so we can assign them
    // to the Vue app in a single blow.
    app.methods = {
        do_edit: app.do_edit,
        do_cancel: app.do_cancel,
        do_save: app.do_save,
        add_note: app.add_note,
        do_delete: app.do_delete,
        toggle_delete: app.toggle_delete,
        toggle_starred: app.toggle_starred,
        style_helper: app.style_helper,
        transparent_helper: app.transparent_helper,
        color_change: app.color_change,
        img_upload: app.img_upload,
        remove_image: app.remove_image,
    };

    // This creates the Vue instance.
    app.vue = new Vue({
        el: "#vue-target",
        data: app.data,
        methods: app.methods
    });

    // And this initializes it.
    app.init = () => {
        //Load the notes from the server instead.
        axios.get(notes_url).then((result) => {
            //DEBUG console.log("In the intial get: ", result.data.notes)
            // We set the posts.
            app.vue.notes = app.index(result.data.notes);
        })
    };

    // Call to the initializer.
    app.init();
};

// This takes the (empty) app object, and initializes it,
// putting all the code i
init(app);
