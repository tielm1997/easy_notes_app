"""
This file defines actions, i.e. functions the URLs are mapped into
The @action(path) decorator exposed the function at URL:

    http://127.0.0.1:8000/{app_name}/{path}

If app_name == '_default' then simply

    http://127.0.0.1:8000/{path}

If path == 'index' it can be omitted:

    http://127.0.0.1:8000/

The path follows the bottlepy syntax.

@action.uses('generic.html')  indicates that the action uses the generic.html template
@action.uses(session)         indicates that the action uses the session
@action.uses(db)              indicates that the action uses the db
@action.uses(T)               indicates that the action uses the i18n & pluralization
@action.uses(auth.user)       indicates that the action requires a logged in user
@action.uses(auth)            indicates that the action requires the auth object

session, db, T, auth, and tempates are examples of Fixtures.
Warning: Fixtures MUST be declared with @action.uses({fixtures}) else your app will result in undefined behavior
"""

import random
import time
import uuid
import datetime
import os  
import pathlib
import base64

from py4web import action, request, abort, redirect, URL, Field, HTTP
from py4web.utils.form import Form, FormStyleBulma
from py4web.utils.url_signer import URLSigner
from PIL import Image

from yatl.helpers import A
from . common import db, session, T, cache, auth, signed_url

from .components.fileupload import FileUpload

def get_time():
    return datetime.datetime.utcnow()

url_signer = URLSigner(session)

# This sorts the notes received from the database before
# sending them to index.html
def sort_notes(notes):
    notes = sorted(notes, reverse=True, key=lambda i: (i['last_modified']))
    starred_notes = []
    reg_notes = []
    for n in notes:
        if n['starred'] is True:
            starred_notes.append(n)
        else:
            reg_notes.append(n)
    ord_notes = starred_notes + reg_notes
    return ord_notes


# The auth.user below forces login.
@action('index')
@action.uses(auth.user, session, url_signer, 'index.html')
def index():
    return dict(
        # This is an example of a signed URL for the callback.
        # See the index.html template for how this is passed to the javascript.
        set_color_url=URL('set_color', signer=url_signer),
        set_starred_url=URL('set_starred', signer=url_signer),
        delete_url = URL('delete_note', signer=url_signer),
        notes_url = URL('notes', signer=url_signer),
        callback_url = URL('callback', signer=url_signer),
        image_url = URL('image', signer=url_signer),
        remove_image_url = URL('remove_image', signer=url_signer),
        user_email = auth.current_user.get('email'),
    )

@action('notes', method="GET")
@action.uses(db, auth.user, session, url_signer.verify())
def get_notes():
    notes = db(db.note.email == auth.current_user.get("email")).select().as_list()
    notes = sort_notes(notes)
    return dict(notes=notes)

@action('notes',  method="POST")
@action.uses(db, auth.user, session, url_signer.verify())
def save_note():
    id = request.json.get('id') # Note: id can be none.
    title = request.json.get('title')
    starred = request.json.get('starred')
    color = request.json.get('color')
    content = request.json.get('content')
    image = request.json.get('image')
    
    last_modified = get_time()
    if id is None:
        # post is new and needs to be added to db
        id = db.note.insert(
            title=request.json.get('title'),
            starred=request.json.get('starred'),
            color=request.json.get('color'),
            content=request.json.get('content'),
            image=request.json.get('image'),
        )
    else:
        # note exists and needs to be updated
        n = db(db.note.id == id).select().first()
        n.title = request.json.get('title')
        n.starred = request.json.get('starred')
        n.color = request.json.get('color')
        n.content = request.json.get('content')
        n.image = request.json.get('image')
        n.last_modified = last_modified
        n.update_record()
    return dict(title=title, starred=starred, color=color, content=content, image=image, id=id, last_modified=last_modified)

@action('delete_note',  method="POST")
@action.uses(db, auth.user, session, url_signer.verify())
def delete_note():
    db((db.note.email == auth.current_user.get("email")) &
       (db.note.id == request.json.get('id'))).delete()
    return "ok"
    #will eventually need to add something else that gets rid of the note.image
    #and deletes that image in the images directory (if note.image is not '')
    
@action('set_starred',  method="POST")
@action.uses(db, auth.user, session, url_signer.verify())
def set_starred():
    """Sets starred."""
    id = request.json.get('id')
    last_modified = get_time()
    assert id is not None
    db.note.update_or_insert(
        ((db.note.id == id) & (db.note.email == auth.current_user.get("email"))),
        starred=request.json.get('starred'),
        last_modified=last_modified,
    )
    return dict(last_modified=last_modified)

@action('set_color',  method="POST")
@action.uses(db, auth.user, session, url_signer.verify())
def set_color():
    """Sets color."""
    id = request.json.get('id')
    assert id is not None
    db.note.update_or_insert(
        ((db.note.id == id) & (db.note.email == auth.current_user.get("email"))),
        color=request.json.get('color'),
    )
    return dict()
    
@action('image',  method="POST")
@action.uses(db, auth.user, session, url_signer.verify())
def image():
    """Add image to filesystem and returns path to note"""

    img = request.files.get("image")
    id = request.forms.get("id")
    last_modified = get_time()
    """assert id is not None"""
    """Create local filepath for the image & return the filepath"""
    filename = str(auth.current_user.get("email")) + str(id) + ".png"
    filepath_str = pathlib.Path(__file__).resolve().parent / 'static' / 'images' / filename
    with filepath_str.open(mode="wb") as f:
        f.write(img.file.read())
    
    filepath = "images/" + filename
    db.note.update_or_insert(
        ((db.note.id == id) & (db.note.email == auth.current_user.get("email"))),
        image=filepath,
        last_modified=last_modified,
    )
    return dict(filepath=filepath, last_modified=last_modified)
    
@action('remove_image',  method="POST")
@action.uses(db, auth.user, session, url_signer.verify())
def remove_image():
    """Delete image from filesystem"""

    filename = str(request.json.get('image'))
    id = request.json.get('id')
    """assert id is not None"""
    """Find image at specified filepath and remove"""

    filepath_str = pathlib.Path(__file__).resolve().parent / 'static' / filename
    
    pathlib.Path(filepath_str).unlink()

    db.note.update_or_insert(
        ((db.note.id == id) & (db.note.email == auth.current_user.get("email"))),
        image=None,
    )
    return dict()
    
    