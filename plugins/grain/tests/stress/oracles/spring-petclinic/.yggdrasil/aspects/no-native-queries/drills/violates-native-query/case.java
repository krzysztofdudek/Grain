package org.springframework.samples.petclinic.owner;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PetTypeRepository extends JpaRepository<PetType, Integer> {

	@Query(value = "SELECT * FROM types ORDER BY name", nativeQuery = true)
	List<PetType> findPetTypes();

}
