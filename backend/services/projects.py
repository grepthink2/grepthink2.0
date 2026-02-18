from fastapi import HTTPException
from uuid import UUID
from database.client import supabase, service_client
from datetime import datetime, timezone
from pydantic import BaseModel

class ReviewRequest(BaseModel):
    request_status: str # approved or rejected

class RoleRequest(BaseModel):
    user_id: UUID
    role: str # member, owner, or scrum master

### utility functions
def is_teacher(user_id, class_id):
    try:
        client = service_client if service_client else supabase
        classes_result = (
            client.table('classes').select('created_by')
            .eq('created_by', str(user_id)).eq('id', str(class_id))
            .execute()
        )
        return len(classes_result.data) > 0
    except Exception as e:
        print(f"Error checking if user in teacher: {e}")
    
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
        return is_teacher(user_id, class_id)
    except Exception as e:
        print(f"Error checking if user in class: {e}")

def is_admin(user_id, project_id):
    """Checks if user has admin privillges for a project"""
    try:
        client = service_client if service_client else supabase
                
        # check if you are the owner of the project
        enrollment_result = (
            client.table('project_members').select('user_id')
            .eq('user_id', str(user_id)).eq('role', "owner")
            .execute()
        )
        if enrollment_result.data:
            return True
        
        #fetch class_id
        class_result = (
            client.table('projects').select('class_id')
            .eq('id', str(project_id))
            .execute()
        )
        if not class_result.data:
            return False
        
        class_id = class_result.data[0]['class_id']

        # check is user is teacher of the class
        return is_teacher(user_id, class_id)

    except Exception as e:
        print(f"Error checking if user is admin of project: {e}")


### endpoint functions
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
        if is_admin(user_id, project_id): # get all pending requests if owner/teacher
            request_result = (
                client.table('project_join_requests').select("id", "user_id, created_at, request_status")
                .eq("project_id", project_id).eq("request_status", "pending")
                #.neq("request_status", "closed")
                .execute()
            )
        else: # get only your requests otherwise
            request_result = (
                client.table('project_join_requests').select("id", "user_id, created_at, request_status")
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
            client.table('project_members').select('user_id')
            .eq("user_id", user_id).eq("project_id", project_id)
            .execute()
        )
        if members_result.data:
            raise HTTPException(status_code=403, detail='Already in Project')

        # check if there is an active request ongoing
        request_result = (
            client.table('project_join_requests').select('user_id')
            .eq("user_id", user_id).eq("project_id", project_id)
            #.neq("request_status", "closed")
            .execute()
        )
        if request_result.data:
            raise HTTPException(status_code=403, detail='Active request still ongoing')

        # fetch owner to set as reviewer
        members_result = (
            client.table('project_members').select('*')
            .eq("role", "owner").eq("project_id", project_id)
            .execute()
        )
        if not members_result.data:
            raise HTTPException(status_code=403, detail='No Owner')
        owner_id = members_result.data[0]['user_id']
        
        # add request
        request_data = {
            "project_id": str(project_id),
            "user_id": str(user_id),
            "reviewer_id": str(owner_id),
            "request_status": "pending"
        }
        client.table('project_join_requests').insert(request_data).execute()
        return {
            "message": "Sent project join request",
            "project": project_id
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send project join request: {str(e)}")

def review_project_join_request(request_id: UUID, data:ReviewRequest, payload: dict):
    """Request to join a project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = payload.get('sub')

    client = service_client if service_client else supabase

    request_response = (
        client.table("project_join_requests").select("project_id")
        .eq("id", request_id)
        .execute()
    )
    if not request_response.data:
        raise HTTPException(status_code=404, detail=f'Could not find request')
    project_id = request_response.data[0]["project_id"]


    if not is_admin(user_id, project_id): #only allow owner or teacher to accept/reject requests
        raise HTTPException(status_code=403, detail="Not authorized to review project join requests")

    try:
        client = service_client if service_client else supabase
        # update join request
        (client.table("project_join_requests").update({
                "reviewer_id": user_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "request_status": data.request_status
            })
            .eq("id", request_id)
            .execute()
        )

        #add member if approved
        if data.request_status == "approved":
            new_member_data = {
                "user_id": user_id,
                "project_id": project_id,
                "role": "member"
            }
            client.table("project_members").insert(new_member_data).execute()

        return {
            "message": "Reviewed project join request",
            "request_status": data.request_status
        }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to review project join request: {str(e)}")


def set_project_role(project_id: UUID, data:RoleRequest, payload: dict):
    """Request to join a project"""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = payload.get('sub')
    if not is_admin(user_id, project_id): #only allow owner or teacher to set user roles
        raise HTTPException(status_code=403, detail="Not authorized to change roles")

    try:
        client = service_client if service_client else supabase
        # update user role
        response = (
            client.table("project_members")
            .update({"role": data.role})
            .eq("user_id", data.user_id).eq("project_id", project_id)
            .execute()
        )
        if response.data:
            return {
                "message": "Changed roles successfully",
                "member": data.user_id,
                "role": data.role
            }
        else:
            raise HTTPException(status_code=404, detail=f'Could not find project member')
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending join request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to review project join request: {str(e)}")
    