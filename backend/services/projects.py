from fastapi import HTTPException
from uuid import UUID
from database.client import supabase, service_client

### utility functions
def in_class(user_id, project_id):
    """Checks if user is in class the project is in"""
    try:
        client = service_client if service_client else supabase
        
        # fetch class
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            return False
        class_id =  class_result.data[0]['class_id']

        # check is user is student of the class
        enrollment_result = (
            client.table('class_enrollments').select('id')
            .eq('user_id', str(user_id)).eq('class_id', str(class_id))
            .execute()
        )
        if enrollment_result.data:
            return True
        
        # check is user is teacher of the class
        classes_result = (
            client.table('class').select('created_by')
            .eq('created_by', str(user_id)).eq('id', str(class_id))
            .execute()
        )
        if classes_result.data:
            return True
        
        return False
    except Exception as e:
        print(f"Error checking if user in class: {e}")

def is_admin(user_id, project_id):
    """Checks if user has admin privillges for a project"""
    try:
        client = service_client if service_client else supabase
        
        #check if user is the teacher of the class
        class_result = (
            client.table('projects').select('class_id, created_by')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            return False
        
        class_id = class_result.data[0]['class_id']

        classes_result = (
            client.table('class').select('created_by')
            .eq('created_by', str(user_id)).eq('id', str(class_id))
            .execute()
        )
        if classes_result.data:
            return True
        
        # check if you are the owner of the project
        enrollment_result = (
            client.table('project_members').select('id')
            .eq('user_id', str(user_id)).eq('role', "owner")
            .execute()
        )
        if enrollment_result.data:
            return True
        return False
    except Exception as e:
        print(f"Error checking if user in admin of project: {e}")


### endpoint functions
def send_project_join_request(project_id: UUID, payload: dict):
    """Request to join a project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    if not in_class(user_id, project_id):
        raise HTTPException(status_code=403, detail="Not in class the project is in")

    try:
        client = service_client if service_client else supabase
        
        # check if in project already
        members_result = (
            client.table('project_members').select('id')
            .eq("user_id", user_id).eq("project_id", project_id)
            #.neq("request_status", "closed")
            .execute()
        )
        if members_result.data:
            raise HTTPException(status_code=403, detail='Already in Project')

        # check if there is an active request ongoing
        request_result = (
            client.table('project_join_requests').select('id')
            .eq("user_id", user_id).eq("project_id", project_id)
            #.neq("request_status", "closed")
            .execute()
        )
        if request_result.data:
            raise HTTPException(status_code=403, detail='Active request still ongoing')

        # add request
        request_data = {
            "project_id": project_id,
            "user_id": user_id,
            "request_status": "in review"
        }
        client.table('project_join_requests').insert(request_data).execute()
        return {"message": "Sent project join request"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send project join request: {str(e)}")
    
def get_project_join_requests(project_id: UUID, payload: dict):
    """See join requests for a project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    if not in_class(user_id, project_id):
        raise HTTPException(status_code=403, detail="Not in class the project is in")

    try:
        client = service_client if service_client else supabase
        
        request_result = []
        if is_admin(user_id, project_id): # get all requests if owner/teacher
            request_result = (
                client.table('project_join_requests').select("user_id, created_at, request_status")
                .eq("project_id", project_id)
                #.neq("request_status", "closed")
                .execute()
            )
        else: # get only your requests otherwise
            request_result = (
                client.table('project_join_requests').select("user_id, created_at, request_status")
                .eq("project_id", project_id).eq("user_id", user_id)
                #.neq("request_status", "closed")
                .execute()
            )
        return {"requests": request_result.data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching project join requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch project join requests: {str(e)}")