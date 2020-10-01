"""
This file defines the database models
"""
import datetime

from . common import db, Field, auth
from pydal.validators import *

def get_user_email():
    return auth.current_user.get('email') if auth.current_user else None

def get_time():
    return datetime.datetime.utcnow()

db.define_table("note",
                Field('email', default=get_user_email),
                Field('title', 'text'),
                Field('content', 'text'),
                Field('image', 'text', defualt=''),
                Field('starred', 'boolean'),
                Field('color', 'integer',
                      requires=IS_INT_IN_RANGE(0, 4),
                      default=0),
                Field('last_modified', 'datetime', default=get_time),
                )

db.commit()
