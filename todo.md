How to verify:                                                                          
                                                                                          
  1. Start the server: JWT_SECRET=test-secret bun --hot src/api/server.ts                 
  2. Open http://localhost:8090/_/ and log in with admin credentials                      
  3. Test create collection:                                                              
    - Click "New Collection" button in sidebar                                            
    - Enter collection name (e.g., "products")                                            
    - Verify it creates and navigates to schema editor                                    
    - Verify the new collection appears in the sidebar immediately                        
  4. Test add field:                                                                      
    - Click "Add Field" button                                                            
    - Fill in: name="title", type="text", required=on                                     
    - Click "Create Field"                                                                
    - Verify field appears in table                                                       
  5. Test edit field:                                                                     
    - Click the three-dot menu on the field row → Edit → Change required → Update Field   
  6. Test delete field:                                                                   
    - Click three-dot menu → Delete → Confirm                                             
  7. Test delete collection:                                                              
    - Click "Delete Collection" button → Confirm                                          
    - Verify returns to dashboard and collection is gone                                  
  8. Test navigation:                                                                     
    - Hover over a collection in sidebar - Settings icon should appear                    
    - Click Settings icon - should show schema editor                                     
    - Click "Back" button - should return to records view                                 
                                                           